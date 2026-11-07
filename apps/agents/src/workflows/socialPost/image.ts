import { randomUUID } from 'node:crypto';
import { supabase } from '@platform/db';
import type { SocialPostImageOutcome } from '@platform/shared';
import { resolveImageModelId, stepRequestContext } from '../../config/model.js';
import { charlie } from '../../agents/contentCreator/index.js';
import { lex } from '../../agents/compliance/index.js';
import { generateImage, MAX_REFERENCE_IMAGES } from '../../lib/openrouterImage.js';
import { lexVerdictSchema, type LexVerdict, type Platform } from '../variant/schemas.js';
import {
  FALLBACK_IMAGE_BRIEF,
  buildAltTextLexPrompt,
  buildImageBriefPrompt,
  imageBriefRewriteInstruction,
  imageBriefSchema,
  lintImageBrief,
  recentMotifs,
  type ImageBrief,
} from './imageBrief.js';
import { activeMotifs, buildImagePrompt, toBrandVisual, type BrandVisual } from './imagePrompt.js';
import { composePlatformImage, platformCrop, toPngMaster } from './imageCompose.js';
import type { StoryCandidate } from './select.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('social-post-image');

// Step 5b of social_post_from_news: one on-brand image per run, shared by the
// LinkedIn and X drafts. Best-effort end to end — it runs after both drafts are
// persisted, never throws, and nothing here can change the run's status.
//
//   load canon + motif history → brief (LLM) → lint (one re-brief, then skip)
//   → buildImagePrompt (pure) → render (OpenRouter) → crop + mark + upload
//   → Lex on alt text (advisory) → content_images rows + agent_activity
//
// Spec: docs/features/social-post-image/feature-spec.md

// content_images' new columns and brand_visual are not in the generated types
// until they are regenerated after the migration applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const BUCKET = 'platform-files';
const RENDER_SCOPE = 'social_post.image_render';
const MOTIF_HISTORY_ROWS = 10;
const ANCHOR_URL_TTL_S = 60 * 60;
/** Email links: 7 days. If it expires, the alt text shows and Review still works. */
const EMAIL_URL_TTL_S = 7 * 24 * 60 * 60;

export interface PersistedPost {
  contentItemId: string;
  platform: Platform;
}

export interface ImageStepParams {
  accountIds: string[];
  story: Pick<StoryCandidate, 'id' | 'title' | 'summary' | 'key_points'>;
  form: string;
  /** Persisted copy the image sits beside (LinkedIn, else X). */
  postCopy: string;
  posts: PersistedPost[];
  /** platform_specs.image_specs per platform, for the crop sizes. */
  imageSpecs: Map<Platform, unknown>;
}

export interface EmailImage {
  url: string;
  altText: string;
}

export interface ImageStepResult {
  outcome: SocialPostImageOutcome;
  /** Signed URL + alt text per content item, for the founder email. */
  images: Map<string, EmailImage>;
}

async function generateBrief(prompt: string): Promise<ImageBrief> {
  try {
    const response = await charlie.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('social_post.image_brief'),
      structuredOutput: { schema: imageBriefSchema, errorStrategy: 'fallback', fallbackValue: FALLBACK_IMAGE_BRIEF },
    });
    return imageBriefSchema.parse(response.object ?? FALLBACK_IMAGE_BRIEF);
  } catch (err) {
    log.warn({ err }, 'image brief generation failed');
    return FALLBACK_IMAGE_BRIEF;
  }
}

async function classifyAltText(altText: string): Promise<LexVerdict> {
  const fallback: LexVerdict = {
    classification: 'general_advice',
    needs_disclaimer: false,
    disclaimer_key: null,
    rationale: 'Alt-text compliance check unavailable — flagged for review (fail-safe).',
  };
  try {
    const response = await lex.generate([{ role: 'user', content: buildAltTextLexPrompt(altText) }], {
      requestContext: stepRequestContext('social_post.compliance_check'),
      structuredOutput: { schema: lexVerdictSchema, errorStrategy: 'fallback', fallbackValue: fallback },
    });
    return lexVerdictSchema.parse(response.object ?? fallback);
  } catch (err) {
    log.warn({ err }, 'alt-text compliance check failed');
    return fallback;
  }
}

async function loadCanon(): Promise<BrandVisual | null> {
  const { data, error } = await db
    .from('brand_visual')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`brand_visual read failed: ${error.message}`);
  return data ? toBrandVisual(data) : null;
}

async function loadRecentMotifs(accountIds: string[]): Promise<string[]> {
  const { data, error } = await db
    .from('content_images')
    .select('generation_group_id, image_brief, created_at, content_items!inner(social_account_id)')
    .eq('source', 'ai_generated')
    .in('content_items.social_account_id', accountIds)
    .order('created_at', { ascending: false })
    .limit(MOTIF_HISTORY_ROWS);
  if (error) {
    log.warn({ error: error.message }, 'motif history read failed');
    return [];
  }
  return recentMotifs(data);
}

/** Never throws: a missing URL only drops a reference image or an email preview. */
async function signedUrl(path: string, ttlSeconds: number): Promise<string | null> {
  try {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl as string;
  } catch (err) {
    log.warn({ err, path }, 'signed URL failed');
    return null;
  }
}

async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await db.storage.from(BUCKET).remove(paths);
  } catch (err) {
    log.warn({ err }, 'cleanup of uploaded image objects failed');
  }
}

async function logActivity(rows: Array<Record<string, unknown>>): Promise<void> {
  try {
    const { error } = await db.from('agent_activity').insert(rows);
    if (error) log.warn({ error: error.message }, 'image agent_activity insert failed');
  } catch (err) {
    log.warn({ err }, 'image agent_activity insert threw');
  }
}

function summariseError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

/** Step 5b. Never throws. */
export async function runImageStep(params: ImageStepParams): Promise<ImageStepResult> {
  const images = new Map<string, EmailImage>();
  if (params.posts.length === 0) {
    return { outcome: { status: 'skipped', reason: 'No persisted posts to illustrate.' }, images };
  }
  // The audit rows hang off the LinkedIn draft when there is one.
  const primary = params.posts.find((p) => p.platform === 'linkedin') ?? params.posts[0]!;

  let canon: BrandVisual | null;
  try {
    canon = await loadCanon();
  } catch (err) {
    log.error({ err }, 'brand visual canon load failed');
    return { outcome: { status: 'failed', reason: summariseError(err) }, images };
  }
  if (!canon) {
    log.info('no active brand_visual row — image step disabled');
    return { outcome: { status: 'disabled', reason: 'No active brand_visual canon.' }, images };
  }

  const skip = async (reason: string, motifKey?: string): Promise<ImageStepResult> => {
    await logActivity([
      {
        agent_name: 'charlie',
        action: 'social_image_skipped',
        status: 'pending',
        trigger_type: 'scheduled',
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [{ type: 'social_image', skipped: true, reason, story_id: params.story.id }],
      },
    ]);
    return { outcome: { status: 'skipped', reason, ...(motifKey ? { motif_key: motifKey } : {}) }, images };
  };

  // ── 5b.1–5b.3: motif history → brief → lint (one re-brief, then skip) ──────
  const motifs = activeMotifs(canon);
  if (motifs.length === 0) return skip('The brand visual canon has no active motifs.');
  const recentMotifKeys = await loadRecentMotifs(params.accountIds);
  const briefParams = {
    story: params.story,
    form: params.form,
    postCopy: params.postCopy,
    motifs,
    recentMotifKeys,
  };
  const lintOpts = { motifs, prohibitedTerms: canon.prohibitedTerms };

  let brief = await generateBrief(buildImageBriefPrompt(briefParams));
  let flags = lintImageBrief(brief, lintOpts);
  if (flags.length > 0) {
    brief = await generateBrief(
      buildImageBriefPrompt({ ...briefParams, rewriteInstruction: imageBriefRewriteInstruction(flags) }),
    );
    flags = lintImageBrief(brief, lintOpts);
  }
  if (brief.skip) return skip(brief.skip_reason?.trim() || 'The brief chose not to illustrate this story.');
  if (flags.length > 0) return skip(`Brief failed lint twice: ${flags.join(' ')}`, brief.motif_key ?? undefined);

  const motifKey = brief.motif_key!;
  const altText = brief.alt_text!.trim();
  const groupId = randomUUID();
  const uploaded: string[] = [];

  try {
    // ── 5b.4–5b.5: assemble + render ─────────────────────────────────────────
    const aspectRatio = canon.defaultAspectRatio;
    const prompt = buildImagePrompt(canon, brief, { aspectRatio });
    const apiKey = process.env['OPENROUTER_API_KEY'];
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set; the image render needs OpenRouter.');
    const model = await resolveImageModelId(RENDER_SCOPE);

    const referenceUrls: string[] = [];
    for (const path of canon.styleAnchorPaths.slice(0, MAX_REFERENCE_IMAGES)) {
      const url = await signedUrl(path, ANCHOR_URL_TTL_S);
      if (url) referenceUrls.push(url);
    }

    const rendered = await generateImage({ model, prompt, aspectRatio, referenceUrls }, { apiKey });

    // ── 5b.6: crop + mark + upload (insert rows only after every object lands) ─
    const master = await toPngMaster(rendered.image);
    const folder = `social-images/${new Date().toISOString().slice(0, 10)}/${groupId}`;
    const objects: Array<{ path: string; bytes: Buffer }> = [{ path: `${folder}/master-16x9.png`, bytes: master }];
    const cropPaths = new Map<string, { path: string; cropKey: string }>();
    for (const post of params.posts) {
      const crop = platformCrop(post.platform, params.imageSpecs.get(post.platform));
      const path = `${folder}/${crop.fileName}`;
      if (!objects.some((o) => o.path === path)) {
        objects.push({ path, bytes: await composePlatformImage(master, crop, canon.brandMark) });
      }
      cropPaths.set(post.contentItemId, { path, cropKey: crop.cropKey });
    }
    for (const obj of objects) {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(obj.path, obj.bytes, { contentType: 'image/png', upsert: false });
      if (error) throw new Error(`upload of ${obj.path} failed: ${error.message}`);
      uploaded.push(obj.path);
    }

    // ── 5b.7: Lex on the alt text (advisory, never blocks) ───────────────────
    const verdict = await classifyAltText(altText);
    const altTextVerdict = {
      classification: verdict.classification,
      needs_disclaimer: false,
      rationale: verdict.rationale,
      checked_at: new Date().toISOString(),
    };

    // ── 5b.8: persist ────────────────────────────────────────────────────────
    const rows = params.posts.map((post) => ({
      content_item_id: post.contentItemId,
      thread_segment_id: null,
      storage_path: cropPaths.get(post.contentItemId)!.path,
      alt_text: altText,
      platform_crop: cropPaths.get(post.contentItemId)!.cropKey,
      sort_order: 0,
      source: 'ai_generated',
      created_by: null,
      generation_group_id: groupId,
      image_brief: brief,
      assembled_prompt: prompt,
      brand_visual_version: canon.version,
      model_id: model,
      generation_ref: rendered.generationRef,
      cost_usd: rendered.costUsd,
      alt_text_verdict: altTextVerdict,
    }));
    const { error: insErr } = await db.from('content_images').insert(rows);
    if (insErr) throw new Error(`content_images insert failed: ${insErr.message}`);

    await logActivity([
      {
        agent_name: 'charlie',
        action: 'social_image_generated',
        status: 'pending',
        trigger_type: 'scheduled',
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [
          {
            type: 'social_image',
            generation_group_id: groupId,
            content_item_ids: params.posts.map((p) => p.contentItemId),
            motif_key: motifKey,
            model_id: model,
            cost_usd: rendered.costUsd,
            references_sent: rendered.referencesDropped ? 0 : referenceUrls.length,
            references_dropped: rendered.referencesDropped,
          },
        ],
      },
      {
        agent_name: 'lex',
        action: 'compliance_checked',
        status: 'pending',
        trigger_type: 'scheduled',
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [
          { type: 'image_alt_text', generation_group_id: groupId, classification: verdict.classification },
        ],
      },
    ]);

    // Email links are a convenience: a missing URL just means no image in the card.
    for (const post of params.posts) {
      const url = await signedUrl(cropPaths.get(post.contentItemId)!.path, EMAIL_URL_TTL_S);
      if (url) images.set(post.contentItemId, { url, altText });
    }

    return {
      outcome: {
        status: 'generated',
        generation_group_id: groupId,
        motif_key: motifKey,
        ...(rendered.costUsd !== null ? { cost_usd: rendered.costUsd } : {}),
      },
      images,
    };
  } catch (err) {
    log.error({ err, groupId }, 'image step failed');
    // No partial state: an unmarked or orphaned image never reaches a founder.
    await removeObjects(uploaded);
    return { outcome: { status: 'failed', motif_key: motifKey, reason: summariseError(err) }, images };
  }
}
