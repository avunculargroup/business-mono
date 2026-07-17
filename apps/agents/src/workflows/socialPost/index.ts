import { supabase } from '@platform/db';
import { resolveVoiceContext } from '@platform/voice';
import type {
  RoutineFrequency,
  RoutineResult,
  SocialPostFromNewsConfig,
  SocialPostFromNewsResult,
  SocialPostDraft,
} from '@platform/shared';
import { formatResolvedVoice, formatCadenceExemplars, extractFormatConfig } from '../../lib/voicePrompt.js';
import { stepRequestContext } from '../../config/model.js';
import { charlie } from '../../agents/contentCreator/index.js';
import { editor } from '../../agents/editorial/index.js';
import { lex } from '../../agents/compliance/index.js';
import { applyThreadStyle, buildLexPrompt, variantCopyText } from '../variant/prompts.js';
import { charlieVariantSchema, lexVerdictSchema, type Platform, type CharlieVariant, type LexVerdict } from '../variant/schemas.js';
import { buildSocialPostRow, buildThreadSegmentRows, type DisclaimerRef } from './persist.js';
import { buildEditorSelectionPrompt, buildSocialPostPrompt, type PlatformSpecLite, type LengthTarget } from './prompts.js';
import { editorSelectionSchema, mapNewsRowToCandidate, resolveSelection, type StoryCandidate } from './select.js';
import { toRecentPosts, extractOpeningLines, recentForms, type RecentPost } from './history.js';
import { toGuidelines, buildGuidelinesBlock } from './guidelines.js';
import { scoreAiTells, aiTellRewriteInstruction } from './aiTell.js';
import { sendSocialDraft, type SocialDraftPost } from '../../lib/sendSocialDraft.js';
// Type-only — erased at compile time, so no runtime import cycle with the
// workflow file (which imports this handler's value). Mirrors runIndicatorPoll.
import type { RoutineOutcome } from '../executeRoutineWorkflow.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('social-post');

// social_post_from_news routine handler. One routine per founder: pick the day's
// news story that best fits the founder's voice (editor), draft a LinkedIn + an X
// post in their voice (Charlie), classify advice risk (Lex), persist both as
// content_items drafts, and email the founder to review. Reuses the campaign
// social-posting building blocks (voice resolver, Charlie/Lex prompts, platform
// specs, thread segments) driven by a story instead of a campaign beat.

// The campaign content_items columns are not in the generated Database types.
// Cast to bypass typing — the same pattern the variant workflow uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RoutineInput {
  id: string;
  name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  frequency: string;
  time_of_day: string;
  timezone: string;
}

interface FounderAccount {
  id: string;
  platform: Platform;
  displayName: string;
}

const DEFAULT_PLATFORMS: Platform[] = ['linkedin', 'twitter_x'];
const CANDIDATE_LIMIT = 30;
const RECENT_POST_LIMIT = 10;

/**
 * A deterministic per-day, per-founder brevity target, so length varies across
 * days without a config knob. Same for both platforms in a single run — length is
 * a "how the founder feels today" decision, not a per-platform one.
 */
function pickLengthTarget(founderId: string): LengthTarget {
  const key = `${new Date().toISOString().slice(0, 10)}:${founderId}`;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (['standard', 'short', 'punchy'] as const)[h % 3];
}

async function generateDraft(prompt: string): Promise<CharlieVariant> {
  const fallback: CharlieVariant = { is_thread: false, title: '', body: '', segments: [], charlie_note: 'Generation failed.' };
  const response = await charlie.generate([{ role: 'user', content: prompt }], {
    requestContext: stepRequestContext('social_post.generate_copy'),
    structuredOutput: { schema: charlieVariantSchema, errorStrategy: 'fallback', fallbackValue: fallback },
  });
  return charlieVariantSchema.parse(response.object ?? fallback);
}

async function classifyDraft(draft: CharlieVariant, disclaimers: DisclaimerRef[]): Promise<LexVerdict> {
  const keys = disclaimers.map((s) => s.key);
  const fallbackKey =
    disclaimers.find((s) => s.key === 'general_advice_warning')?.key ?? disclaimers[0]?.key ?? null;
  const fallback: LexVerdict = {
    classification: 'general_advice',
    needs_disclaimer: fallbackKey !== null,
    disclaimer_key: fallbackKey,
    rationale: 'Compliance check unavailable — defaulting to general advice with a disclaimer (fail-safe).',
  };
  const response = await lex.generate([{ role: 'user', content: buildLexPrompt(draft, keys) }], {
    requestContext: stepRequestContext('social_post.compliance_check'),
    structuredOutput: { schema: lexVerdictSchema, errorStrategy: 'fallback', fallbackValue: fallback },
  });
  return lexVerdictSchema.parse(response.object ?? fallback);
}

export async function runSocialPost(routine: RoutineInput): Promise<RoutineOutcome> {
  const cfg = routine.action_config as unknown as SocialPostFromNewsConfig;
  const founderId = cfg.founder_team_member_id;
  const platforms = (cfg.platforms ?? DEFAULT_PLATFORMS).filter((p): p is Platform =>
    p === 'linkedin' || p === 'twitter_x',
  );
  const lookbackHours = cfg.lookback_hours ?? 24;
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const base: Omit<RoutineOutcome, 'status' | 'result' | 'error'> = {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'social_post_from_news',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
  };
  const fail = (error: string): RoutineOutcome => ({ ...base, status: 'failed', result: null, error });

  if (!founderId) return fail('social_post_from_news routine has no founder_team_member_id in action_config.');

  // ── Founder + their social accounts ─────────────────────────────────────────
  const { data: member, error: memberErr } = await db
    .from('team_members')
    .select('id, full_name')
    .eq('id', founderId)
    .maybeSingle();
  if (memberErr) return fail(`team_members lookup failed: ${memberErr.message}`);
  if (!member) return fail(`team_member ${founderId} not found.`);
  const founderName = (member.full_name as string | null) ?? 'BTS';

  const { data: accountRows, error: accErr } = await db
    .from('social_accounts')
    .select('id, platform, display_name')
    .eq('team_member_id', founderId)
    .eq('account_type', 'founder')
    .eq('is_active', true);
  if (accErr) return fail(`social_accounts lookup failed: ${accErr.message}`);

  const accounts = new Map<Platform, FounderAccount>();
  for (const r of (accountRows ?? []) as Array<{ id: string; platform: Platform; display_name: string | null }>) {
    if (platforms.includes(r.platform) && !accounts.has(r.platform)) {
      accounts.set(r.platform, { id: r.id, platform: r.platform, displayName: r.display_name ?? founderName });
    }
  }
  if (accounts.size === 0) {
    return fail(`No active founder social_accounts for ${founderName} on platforms: ${platforms.join(', ')}.`);
  }

  // ── Platform specs + active disclaimers ─────────────────────────────────────
  const { data: specRows, error: specErr } = await db
    .from('platform_specs')
    .select('platform, max_chars, max_thread_segments, hashtag_guidance')
    .in('platform', [...accounts.keys()]);
  if (specErr) return fail(`platform_specs lookup failed: ${specErr.message}`);
  const specs = new Map<Platform, PlatformSpecLite>();
  for (const s of (specRows ?? []) as PlatformSpecLite[]) specs.set(s.platform, s);

  const { data: snippetRows } = await db.from('compliance_snippets').select('id, key').eq('is_active', true);
  const disclaimers: DisclaimerRef[] = ((snippetRows ?? []) as Array<{ id: string; key: string }>).map((s) => ({
    id: s.id,
    key: s.key,
  }));

  // ── Candidate stories from the day's news ───────────────────────────────────
  const { data: newsRows, error: newsErr } = await db
    .from('news_items')
    .select('id, title, url, summary, key_points, source_name, category, relevance_score, topic_tags, published_at')
    .gte('fetched_at', since)
    .neq('status', 'archived')
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_LIMIT);
  if (newsErr) return fail(`news_items query failed: ${newsErr.message}`);

  const candidates: StoryCandidate[] = (newsRows ?? []).map(mapNewsRowToCandidate);
  if (candidates.length === 0) {
    return {
      ...base,
      status: 'success',
      error: null,
      result: { summary: `No fresh news in the last ${lookbackHours}h to draft posts for ${founderName}.`, sources: [] },
    };
  }

  // ── Recent drafts per account: openers to avoid + forms to rotate away from ─
  // One cheap read per account, only reached once there is news to draft.
  const recentByAccount = new Map<string, RecentPost[]>();
  await Promise.all(
    [...accounts.values()].map(async (account) => {
      const { data: recentRows, error: recentErr } = await db
        .from('content_items')
        .select('title, body, is_thread, post_form, created_at')
        .eq('social_account_id', account.id)
        .eq('source', 'charlie')
        .order('created_at', { ascending: false })
        .limit(RECENT_POST_LIMIT);
      if (recentErr) {
        log.warn({ platform: account.platform, error: recentErr.message }, 'recent content_items read failed');
      }
      recentByAccount.set(account.id, toRecentPosts(recentRows));
    }),
  );

  const lengthTarget = pickLengthTarget(founderId);

  // ── Standing feedback guidelines per account (distilled from past reviews) ──
  // One read for all accounts; a failure degrades to "no guidelines", not a
  // failed run.
  const guidelinesByAccount = new Map<string, string[]>();
  {
    const { data: guidelineRows, error: glErr } = await db
      .from('account_feedback_guidelines')
      .select('social_account_id, guidelines')
      .in('social_account_id', [...accounts.values()].map((a) => a.id));
    if (glErr) {
      log.warn({ error: glErr.message }, 'account_feedback_guidelines read failed');
    }
    for (const r of (guidelineRows ?? []) as Array<{ social_account_id: string; guidelines: unknown }>) {
      guidelinesByAccount.set(r.social_account_id, toGuidelines(r.guidelines));
    }
  }

  // ── Editor picks the best-fit story + form for this founder ─────────────────
  const selectionAccount = accounts.get('linkedin') ?? [...accounts.values()][0]!;
  const selectionVoice = await resolveVoiceContext({ accountId: selectionAccount.id, platform: selectionAccount.platform });
  const selectionVoiceBlock = formatResolvedVoice(selectionVoice);
  const selectionRecentForms = recentForms(recentByAccount.get(selectionAccount.id) ?? []);
  const selectionGuidelines = guidelinesByAccount.get(selectionAccount.id) ?? [];

  let pick = null;
  try {
    const resp = await editor.generate(
      [{ role: 'user', content: buildEditorSelectionPrompt(candidates, selectionVoiceBlock, founderName, selectionRecentForms, selectionGuidelines) }],
      {
        requestContext: stepRequestContext('social_post.editor_select'),
        structuredOutput: { schema: editorSelectionSchema, errorStrategy: 'fallback', fallbackValue: null },
      },
    );
    pick = resp.object ? editorSelectionSchema.parse(resp.object) : null;
  } catch (err) {
    log.warn({ err }, 'editor selection failed');
  }
  const { story, form, rationale } = resolveSelection(candidates, pick);
  const storyQuery = `${story.title}\n${story.summary}`;
  // Did the source story carry figures? Feeds the linter's grounding check.
  const storyHasNumbers = /\d/.test(story.summary) || story.key_points.some((k) => /\d/.test(k));

  // ── Draft each platform: Charlie → Lex → persist ────────────────────────────
  const posts: SocialPostDraft[] = [];
  const emailPosts: SocialDraftPost[] = [];
  for (const account of accounts.values()) {
    const spec = specs.get(account.platform);
    if (!spec) {
      log.warn({ platform: account.platform }, 'no platform_specs row — skipping');
      continue;
    }
    try {
      const voice = await resolveVoiceContext({
        accountId: account.id,
        platform: account.platform,
        query: storyQuery,
      });
      // A second, type-filtered pass for the founder's opener/closer exemplars, so
      // Charlie borrows their cadence — not just on-topic phrasing. Empty for
      // accounts with no such snippets (no block, no extra prompt weight).
      const cadence = await resolveVoiceContext({
        accountId: account.id,
        platform: account.platform,
        query: storyQuery,
        snippetCount: 4,
        snippetTypes: ['opener', 'closer'],
      });
      const cadenceBlock = formatCadenceExemplars(cadence.snippets);
      const formatConfig = extractFormatConfig(voice.profile);
      const recentOpenings = extractOpeningLines(recentByAccount.get(account.id) ?? []);

      const promptParams = {
        story,
        form,
        platform: account.platform,
        platformSpec: spec,
        voiceBlock: formatResolvedVoice(voice),
        formatConfig,
        founderName,
        recentOpenings,
        lengthTarget,
        cadenceBlock,
        guidelinesBlock: buildGuidelinesBlock(guidelinesByAccount.get(account.id) ?? []),
      };

      let draft = applyThreadStyle(await generateDraft(buildSocialPostPrompt(promptParams)), formatConfig);

      // Deterministic AI-tell gate: on offenders only, one rewrite pass carrying
      // the specific flags (reuses the generate_copy scope). Never loops.
      const rewriteInstruction = aiTellRewriteInstruction(
        scoreAiTells(variantCopyText(draft), { storyHasNumbers }),
      );
      if (rewriteInstruction) {
        draft = applyThreadStyle(
          await generateDraft(buildSocialPostPrompt({ ...promptParams, rewriteInstruction })),
          formatConfig,
        );
      }

      const verdict = await classifyDraft(draft, disclaimers);

      const row = buildSocialPostRow({
        platform: account.platform,
        socialAccountId: account.id,
        form,
        draft,
        verdict,
        disclaimerSnippets: disclaimers,
        checkedAt: new Date().toISOString(),
      });
      const { data: inserted, error: insErr } = await db.from('content_items').insert(row).select('id').single();
      if (insErr) throw new Error(`content_items insert failed: ${insErr.message}`);
      const contentItemId = (inserted as { id: string }).id;

      const segments = buildThreadSegmentRows(contentItemId, draft);
      if (segments.length > 0) {
        const { error: segErr } = await db.from('thread_segments').insert(segments);
        if (segErr) throw new Error(`thread_segments insert failed: ${segErr.message}`);
      }

      await db.from('agent_activity').insert([
        {
          agent_name: 'charlie',
          action: 'social_post_drafted',
          status: 'pending',
          trigger_type: 'scheduled',
          entity_type: 'content_item',
          entity_id: contentItemId,
          proposed_actions: [{ type: 'social_post', platform: account.platform, is_thread: row.is_thread, story_id: story.id, form }],
        },
        {
          agent_name: 'lex',
          action: 'compliance_checked',
          status: 'pending',
          trigger_type: 'scheduled',
          entity_type: 'content_item',
          entity_id: contentItemId,
          proposed_actions: [{ type: 'compliance', classification: verdict.classification, needs_disclaimer: verdict.needs_disclaimer }],
        },
      ]);

      posts.push({ contentItemId, platform: account.platform, is_thread: row.is_thread });
      emailPosts.push({
        contentItemId,
        platform: account.platform,
        accountName: account.displayName,
        title: draft.title,
        body: draft.body,
        segments: draft.segments.map((s) => s.body),
        isThread: row.is_thread,
        classification: verdict.classification,
        needsDisclaimer: verdict.needs_disclaimer,
      });
    } catch (err) {
      log.error({ err, platform: account.platform, founderName }, 'draft failed');
    }
  }

  if (posts.length === 0) {
    return fail(`Drafting failed for every platform for ${founderName}.`);
  }

  // ── Email the founder their drafts (best-effort) ────────────────────────────
  let emailed = false;
  try {
    emailed = await sendSocialDraft({ founderTeamMemberId: founderId, founderName, story, posts: emailPosts });
  } catch (err) {
    log.error({ err }, 'founder draft email failed');
  }

  const metadata: SocialPostFromNewsResult = {
    founder_team_member_id: founderId,
    founder_name: founderName,
    story_id: story.id,
    story_url: story.url,
    form,
    posts,
    emailed,
  };
  const result: RoutineResult = {
    summary: `Drafted ${posts.length} post${posts.length === 1 ? '' : 's'} for ${founderName} (${form.replace(/_/g, ' ')}) from: ${story.title}`,
    sources: [
      {
        url: story.url,
        title: story.title,
        source: story.source_name,
        excerpt: rationale,
        retrieved_at: new Date().toISOString(),
      },
    ],
    metadata: metadata as unknown as Record<string, unknown>,
  };

  return { ...base, status: 'success', result, error: null };
}
