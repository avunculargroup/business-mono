import { randomUUID } from 'node:crypto';
import { supabase } from '@platform/db';
import { planCandidateSelection, type CandidateRow, type SocialPostImageOutcome } from '@platform/shared';
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
  recentImageHistory,
  type ImageBrief,
  type ImageBriefPromptParams,
  type ImageConcept,
} from './imageBrief.js';
import { activeLayouts, buildImagePrompt, toBrandVisual, type BrandVisual } from './imagePrompt.js';
import {
  DEFAULT_PAPER_HEX,
  legibility,
  stripBars,
  type BarDetection,
  composePlatformImage,
  correctPaper,
  platformCrop,
  toPngMaster,
  type PaperCorrection,
} from './imageCompose.js';
import type { StoryCandidate } from './select.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('social-post-image');

// Step 5b of social_post_from_news: image candidates for the run, shared by the
// LinkedIn and X drafts. Best-effort end to end — it runs after both drafts are
// persisted, never throws, and nothing here can change the run's status.
//
//   load canon + recent subjects/layouts → brief (LLM, up to three concepts)
//   → lint per concept (one re-brief if none are clean, then skip)
//   → for each clean concept, in parallel:
//       buildImagePrompt (pure) → render (OpenRouter) → paper correction
//       → crop + mark + upload → Lex on alt text (advisory) → content_images rows
//   → select the lowest successful candidate; the founder can pick another
//
// Each rendered concept is its own generation group; the groups of one run share
// a candidate set. Selection is per run, not per platform: LinkedIn and X always
// show the same image. Spec: docs/features/social-post-image/feature-spec.md

// content_images' and brand_visual's newer columns are cast past the generated
// types at this boundary, as the rest of the social post workflow does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const BUCKET = 'platform-files';
const RENDER_SCOPE = 'social_post.image_render';
/** Five runs, each up to three candidate groups across two platforms. */
const HISTORY_ROWS = 40;
/** At most this many concepts are rendered per run. */
export const MAX_CANDIDATES = 3;
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
  /** Other candidates the founder can pick from in Review. */
  moreOptions: number;
}

export interface ImageStepResult {
  outcome: SocialPostImageOutcome;
  /** Signed URL + alt text of the selected image per content item, for the founder email. */
  images: Map<string, EmailImage>;
}

export async function generateBrief(prompt: string): Promise<ImageBrief> {
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

export async function classifyAltText(altText: string): Promise<LexVerdict> {
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

export async function loadCanon(): Promise<BrandVisual | null> {
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

export async function loadImageHistory(accountIds: string[]) {
  const { data, error } = await db
    .from('content_images')
    .select('candidate_set_id, generation_group_id, image_brief, is_selected, created_at, content_items!inner(social_account_id)')
    .eq('source', 'ai_generated')
    .in('content_items.social_account_id', accountIds)
    .order('created_at', { ascending: false })
    .limit(HISTORY_ROWS);
  if (error) {
    log.warn({ error: error.message }, 'image history read failed');
    return recentImageHistory([]);
  }
  return recentImageHistory(data);
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

export async function logActivity(rows: Array<Record<string, unknown>>): Promise<void> {
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

export interface RenderParams {
  canon: BrandVisual;
  /** A concept that has already passed lintImageConcept. */
  concept: ImageConcept;
  posts: PersistedPost[];
  imageSpecs: Map<Platform, unknown>;
  triggerType: 'scheduled' | 'manual';
  candidateSetId: string;
  candidateIndex: number;
}

export type RenderResult =
  | {
      ok: true;
      groupId: string;
      candidateIndex: number;
      layout: string;
      altText: string;
      costUsd: number | null;
      cropPaths: Map<string, string>;
      paper: PaperCorrection;
      bars: BarDetection;
      coverage: number;
    }
  | {
      ok: false;
      candidateIndex: number;
      layout: string;
      reason: string;
      /** Set when a quality check (bars, legibility) dropped a render that did come back. */
      rejected?: { reason: string; coverage: number | null };
    };

/** A render the quality checks dropped: not persisted, recorded on the run's activity. */
class CandidateRejected extends Error {
  constructor(
    readonly reason: string,
    readonly coverage: number | null,
  ) {
    super(reason);
  }
}

/** The palette's paper colour, which the paper correction aims for. */
function paperHex(canon: BrandVisual): string {
  return canon.palette.find((p) => p.role.toLowerCase() === 'paper')?.hex ?? DEFAULT_PAPER_HEX;
}

/**
 * Assemble → render → paper correction → crop + mark + upload → Lex on alt
 * text → persist one candidate: a new generation group, one content_images row
 * per post, written unselected (the set's selection is made once every candidate
 * has settled). Shared by the morning run and the founder's regenerate and
 * render-with-brief actions. Never throws; on failure nothing is left behind
 * (uploaded objects are removed, no rows).
 */
export async function renderAndPersistImage(params: RenderParams): Promise<RenderResult> {
  const { canon, concept, candidateIndex } = params;
  const primary = params.posts.find((p) => p.platform === 'linkedin') ?? params.posts[0]!;
  const layout = concept.layout;
  const altText = concept.alt_text.trim();
  const groupId = randomUUID();
  const uploaded: string[] = [];

  try {
    // ── 5b.4–5b.5: assemble + render ─────────────────────────────────────────
    const aspectRatio = canon.defaultAspectRatio;
    const prompt = buildImagePrompt(canon, concept, { aspectRatio });
    const apiKey = process.env['OPENROUTER_API_KEY'];
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set; the image render needs OpenRouter.');
    const model = await resolveImageModelId(RENDER_SCOPE);

    const referenceUrls: string[] = [];
    for (const path of canon.styleAnchorPaths.slice(0, MAX_REFERENCE_IMAGES)) {
      const url = await signedUrl(path, ANCHOR_URL_TTL_S);
      if (url) referenceUrls.push(url);
    }

    const rendered = await generateImage({ model, prompt, aspectRatio, referenceUrls }, { apiKey });

    // ── 5b.6: bars → paper → legibility → crop + mark + upload ───────────────
    // Bars first: a letterboxed render puts a black bar where the paper sample
    // is read, and the correction silently skips. Then paper: the stored
    // master, every crop and any anchor promoted from it share the corrected
    // paper. Then the phone-size legibility gate, before anything is uploaded.
    const { image: unbarred, bars } = await stripBars(await toPngMaster(rendered.image));
    if (bars.reject) throw new CandidateRejected(bars.reason, null);
    const { image: master, correction: paper } = await correctPaper(unbarred, paperHex(canon));
    const legible = await legibility(master);
    if (!legible.pass) throw new CandidateRejected(legible.reason, legible.coverage);
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
      candidate_set_id: params.candidateSetId,
      candidate_index: candidateIndex,
      is_selected: false,
      image_brief: concept,
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
        trigger_type: params.triggerType,
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [
          {
            type: 'social_image',
            generation_group_id: groupId,
            content_item_ids: params.posts.map((p) => p.contentItemId),
            candidate_set_id: params.candidateSetId,
            candidate_index: candidateIndex,
            layout,
            subject: concept.subject,
            tension: concept.tension,
            model_id: model,
            cost_usd: rendered.costUsd,
            references_sent: rendered.referencesDropped ? 0 : referenceUrls.length,
            references_dropped: rendered.referencesDropped,
            bars: { top: bars.top, bottom: bars.bottom, left: bars.left, right: bars.right },
            paper,
            coverage: legible.coverage,
          },
        ],
      },
      {
        agent_name: 'lex',
        action: 'compliance_checked',
        status: 'pending',
        trigger_type: params.triggerType,
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [
          { type: 'image_alt_text', generation_group_id: groupId, classification: verdict.classification },
        ],
      },
    ]);

    return {
      ok: true,
      groupId,
      candidateIndex,
      layout,
      altText,
      costUsd: rendered.costUsd,
      cropPaths: new Map([...cropPaths].map(([id, c]) => [id, c.path])),
      paper,
      bars,
      coverage: legible.coverage,
    };
  } catch (err) {
    // No partial state: an unmarked or orphaned image never reaches a founder.
    await removeObjects(uploaded);
    if (err instanceof CandidateRejected) {
      log.info({ groupId, candidateIndex, reason: err.reason, coverage: err.coverage }, 'image candidate rejected');
      return { ok: false, candidateIndex, layout, reason: err.reason, rejected: { reason: err.reason, coverage: err.coverage } };
    }
    log.error({ err, groupId, candidateIndex }, 'image candidate failed');
    return { ok: false, candidateIndex, layout, reason: summariseError(err) };
  }
}

/**
 * Make one group the selected image of its set, and every other group of the
 * set unselected. Selection is per run: the set spans both platforms' drafts.
 * Unpicked groups are marked not_chosen only when `markOthers` is set, i.e.
 * when a founder chose; the automatic pick at render time is not a judgement.
 */
export async function selectCandidate(
  candidateSetId: string,
  generationGroupId: string,
  opts: { markOthers: boolean },
): Promise<void> {
  // Read, then update by id: a removed or regenerated group keeps its outcome,
  // and SQL's IN never matches the NULL outcome most rows carry.
  const { data, error: readErr } = await db
    .from('content_images')
    .select('id, generation_group_id, review_outcome')
    .eq('candidate_set_id', candidateSetId);
  if (readErr) throw new Error(`reading the candidate set failed: ${readErr.message}`);
  const { onIds, offIds } = planCandidateSelection((data ?? []) as CandidateRow[], generationGroupId);
  if (onIds.length === 0) throw new Error('that candidate is not in this set');

  if (offIds.length > 0) {
    const off: Record<string, unknown> = { is_selected: false };
    if (opts.markOthers) off['review_outcome'] = 'not_chosen';
    const { error } = await db.from('content_images').update(off).in('id', offIds);
    if (error) throw new Error(`clearing the candidate set's selection failed: ${error.message}`);
  }
  const on: Record<string, unknown> = { is_selected: true };
  if (opts.markOthers) on['review_outcome'] = 'kept';
  const { error } = await db.from('content_images').update(on).in('id', onIds);
  if (error) throw new Error(`selecting the candidate failed: ${error.message}`);
}

export interface CandidateSetResult {
  candidateSetId: string;
  /** Every candidate, in concept order. */
  results: RenderResult[];
  /** The selected candidate, or null when every render failed. */
  selected: Extract<RenderResult, { ok: true }> | null;
}

/**
 * Render each concept as a candidate, in parallel, into one candidate set, then
 * select the lowest successful one. A failed candidate leaves nothing behind
 * and does not affect the others.
 */
export async function renderCandidateSet(params: {
  canon: BrandVisual;
  concepts: ImageConcept[];
  posts: PersistedPost[];
  imageSpecs: Map<Platform, unknown>;
  triggerType: 'scheduled' | 'manual';
  /** Render into an existing set (Edit brief) instead of a new one. */
  candidateSetId?: string;
  /** Index for the first concept, after a set's existing candidates. */
  startIndex?: number;
  /** A founder's choice marks the rest not_chosen; the morning run's pick does not. */
  founderChoice?: boolean;
}): Promise<CandidateSetResult> {
  const candidateSetId = params.candidateSetId ?? randomUUID();
  const startIndex = params.startIndex ?? 0;
  const settled = await Promise.allSettled(
    params.concepts.slice(0, MAX_CANDIDATES).map((concept, i) =>
      renderAndPersistImage({
        canon: params.canon,
        concept,
        posts: params.posts,
        imageSpecs: params.imageSpecs,
        triggerType: params.triggerType,
        candidateSetId,
        candidateIndex: startIndex + i,
      }),
    ),
  );
  // renderAndPersistImage never throws; a rejection here is a bug, kept as a failure.
  const results: RenderResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { ok: false, candidateIndex: startIndex + i, layout: params.concepts[i]?.layout ?? '', reason: summariseError(s.reason) },
  );
  const selected = results.find((r): r is Extract<RenderResult, { ok: true }> => r.ok) ?? null;

  // Rejected renders leave no rows, so the run's activity is their only record.
  const rejected = results.flatMap((r) =>
    !r.ok && r.rejected ? [{ candidate_index: r.candidateIndex, reason: r.rejected.reason, coverage: r.rejected.coverage }] : [],
  );
  if (rejected.length > 0) {
    await logActivity([
      {
        agent_name: 'charlie',
        action: 'social_image_rejected',
        status: 'pending',
        trigger_type: params.triggerType,
        entity_type: 'content_item',
        entity_id: (params.posts.find((p) => p.platform === 'linkedin') ?? params.posts[0])?.contentItemId ?? null,
        proposed_actions: [{ type: 'social_image', candidate_set_id: candidateSetId, rejected }],
      },
    ]);
  }

  if (selected) {
    try {
      await selectCandidate(candidateSetId, selected.groupId, { markOthers: params.founderChoice ?? false });
    } catch (err) {
      // The rows are in place; a founder can still pick one from the page.
      log.error({ err, candidateSetId }, 'selecting the first candidate failed');
    }
  }
  return { candidateSetId, results, selected };
}

/**
 * Ask for a brief and lint it: concepts that fail are dropped; if none
 * survive, one re-brief carries every flag. Returns the clean concepts, or the
 * reason there are none (a skip, or two failed briefs).
 */
export async function briefConcepts(
  canon: BrandVisual,
  params: Omit<ImageBriefPromptParams, 'layouts' | 'prohibitedTerms' | 'rewriteInstruction'>,
): Promise<{ concepts: ImageConcept[] } | { skip: string }> {
  const layouts = activeLayouts(canon);
  if (layouts.length === 0) return { skip: 'The brand visual canon has no active layouts.' };
  const briefParams = { ...params, layouts, prohibitedTerms: canon.prohibitedTerms };
  const lintOpts = { layouts, prohibitedTerms: canon.prohibitedTerms };

  let brief: ImageBrief = await generateBrief(buildImageBriefPrompt(briefParams));
  if (brief.skip) return { skip: brief.skip_reason?.trim() || 'The brief chose not to illustrate this post.' };
  let lint = lintImageBrief(brief, lintOpts);
  if (lint.clean.length === 0) {
    brief = await generateBrief(
      buildImageBriefPrompt({ ...briefParams, rewriteInstruction: imageBriefRewriteInstruction(lint.flags) }),
    );
    if (brief.skip) return { skip: brief.skip_reason?.trim() || 'The brief chose not to illustrate this post.' };
    lint = lintImageBrief(brief, lintOpts);
  }
  if (lint.clean.length === 0) return { skip: `Brief failed lint twice: ${lint.flags.join(' ')}` };
  if (lint.flags.length > 0) log.info({ dropped: lint.flags }, 'image concepts dropped by lint');
  return { concepts: lint.clean };
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

  // ── Brief: recent subjects/layouts → up to three concepts → lint ──────────
  const briefed = await briefConcepts(canon, {
    story: params.story,
    form: params.form,
    postCopy: params.postCopy,
    history: await loadImageHistory(params.accountIds),
  });
  if ('skip' in briefed) {
    await logActivity([
      {
        agent_name: 'charlie',
        action: 'social_image_skipped',
        status: 'pending',
        trigger_type: 'scheduled',
        entity_type: 'content_item',
        entity_id: primary.contentItemId,
        proposed_actions: [{ type: 'social_image', skipped: true, reason: briefed.skip, story_id: params.story.id }],
      },
    ]);
    return { outcome: { status: 'skipped', reason: briefed.skip }, images };
  }

  // ── Render the candidates in parallel; select the first that succeeds ──────
  const set = await renderCandidateSet({
    canon,
    concepts: briefed.concepts,
    posts: params.posts,
    imageSpecs: params.imageSpecs,
    triggerType: 'scheduled',
  });
  const succeeded = set.results.filter((r) => r.ok);
  const cost = succeeded.reduce((sum, r) => sum + (r.ok && r.costUsd !== null ? r.costUsd : 0), 0);
  if (!set.selected) {
    const reasons = set.results.map((r) => (r.ok ? '' : r.reason)).filter(Boolean);
    return {
      outcome: { status: 'failed', candidate_set_id: set.candidateSetId, candidates: 0, reason: reasons.join(' | ') || 'Every candidate failed.' },
      images,
    };
  }

  // Email links are a convenience: a missing URL just means no image in the card.
  for (const post of params.posts) {
    const path = set.selected.cropPaths.get(post.contentItemId);
    const url = path ? await signedUrl(path, EMAIL_URL_TTL_S) : null;
    if (url) images.set(post.contentItemId, { url, altText: set.selected.altText, moreOptions: succeeded.length - 1 });
  }

  return {
    outcome: {
      status: 'generated',
      generation_group_id: set.selected.groupId,
      candidate_set_id: set.candidateSetId,
      candidates: succeeded.length,
      layout: set.selected.layout,
      ...(succeeded.some((r) => r.ok && r.costUsd !== null) ? { cost_usd: Number(cost.toFixed(4)) } : {}),
    },
    images,
  };
}
