import type { Platform, FormatConfigCtx } from '../variant/schemas.js';
import { platformFormatRules } from '../variant/prompts.js';
import type { StoryCandidate } from './select.js';
import { SOCIAL_POST_FORMS, type SocialPostForm } from './forms.js';
import { buildRepetitionBlock } from './history.js';

/** How hard to lean on brevity today — a soft nudge, varied per run. Platform
 *  hard limits (char ceiling) always win regardless. */
export type LengthTarget = 'short' | 'standard' | 'punchy';

const LENGTH_NUDGE: Record<LengthTarget, string> = {
  short:
    'Length today: lean SHORT. A couple of tight, confident lines beats a fully-developed post — an unhedged short post reads human. Do not pad to fill space, and do not force a takeaway.',
  punchy:
    'Length today: keep it PUNCHY and economical. Cut every sentence that is not earning its place; no windup, no summary line.',
  standard: '',
};

// Pure prompt builders for the social_post_from_news routine. The platform format
// rules, char helpers and Lex prompt are reused verbatim from the campaign variant
// workflow (../variant/prompts.js) — the only thing that differs here is the
// source of the idea (a news story + an editor-chosen form, not a campaign beat).
// Kept pure so they can be unit-tested without agents or the DB.

const NO_TOOL_INSTRUCTION =
  'Return ONLY the structured object. Do not call any tool (no persist_content_draft, no supabase tools) — persistence happens later.';

/** A platform_specs row, the subset the prompt needs. */
export interface PlatformSpecLite {
  platform: Platform;
  max_chars: number;
  max_thread_segments?: number | null;
  hashtag_guidance?: string | null;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  twitter_x: 'X (Twitter)',
  linkedin: 'LinkedIn',
};

/** One candidate rendered for the editor's selection prompt. */
function candidateLine(c: StoryCandidate, index: number): string {
  const points = c.key_points.length ? `\n   key points: ${c.key_points.slice(0, 4).join(' · ')}` : '';
  const tags = c.topic_tags.length ? `\n   topics: ${c.topic_tags.join(', ')}` : '';
  return `${index}. ${c.title}\n   source: ${c.source_name} | category: ${c.category} | published: ${
    c.published_at ?? 'unknown'
  }\n   summary: ${c.summary.slice(0, 320)}${points}${tags}`;
}

/**
 * The editor picks the single best-fit story for THIS founder and the post form.
 * The founder's resolved voice block is the fit signal — the editor weighs which
 * story this particular founder is best placed to post about, in their voice.
 * `recentForms` (most-recent first) biases the pick toward variety so the feed
 * does not settle into one repeated shape.
 */
export function buildEditorSelectionPrompt(
  candidates: StoryCandidate[],
  voiceBlock: string,
  founderName: string,
  recentForms: SocialPostForm[] = [],
): string {
  const lines = candidates.map((c, i) => candidateLine(c, i)).join('\n\n');
  const formOptions = Object.entries(SOCIAL_POST_FORMS)
    .map(([key, def]) => `- **${key}** — ${def.editorDesc}`)
    .join('\n');
  const rotation = recentForms.length
    ? `\n\nRecently used forms on this account (most recent first): ${recentForms.join(
        ', ',
      )}. Prefer variety — bias away from these unless a different form would clearly serve this story worse. Humans post shapes, not templates.`
    : '';
  return `You are choosing one Bitcoin/treasury news story for ${founderName} to post about today, and the form their post should take.

Pick the SINGLE story from the candidates below that best fits ${founderName}'s individual voice and the topics they are credible on — not simply the highest-ranked story. Then choose the post form:
${formOptions}${rotation}

Return the verbatim candidate index, the form, and a one-line rationale.

## ${founderName}'s voice (the fit signal)
${voiceBlock}

## Candidates
${lines}`;
}

/**
 * Build Charlie's generation prompt for one platform, given the chosen story and
 * form. Reuses the campaign platform-format rules so LinkedIn/X conventions stay
 * identical across the two features. Charlie decides is_thread (X teaching posts
 * often suit a thread); LinkedIn is always a single post.
 */
export function buildSocialPostPrompt(params: {
  story: StoryCandidate;
  form: SocialPostForm;
  platform: Platform;
  platformSpec: PlatformSpecLite;
  voiceBlock: string;
  formatConfig?: FormatConfigCtx;
  founderName: string;
  /** Openers used on recent drafts for this account — Charlie must not reuse them. */
  recentOpenings?: string[];
  /** Soft brevity nudge for the day; platform hard limits still win. */
  lengthTarget?: LengthTarget;
}): string {
  const {
    story,
    form,
    platform,
    platformSpec,
    voiceBlock,
    formatConfig,
    founderName,
    recentOpenings = [],
    lengthTarget = 'standard',
  } = params;
  const label = PLATFORM_LABEL[platform];
  const allowThread = platform === 'twitter_x' && formatConfig?.thread_style !== 'single-only';

  const formBlock = SOCIAL_POST_FORMS[form].generateInstruction;
  const repetitionBlock = buildRepetitionBlock(recentOpenings);
  const lengthNudge = LENGTH_NUDGE[lengthTarget];

  const formatBlock = allowThread
    ? `Format: a SINGLE post OR an X THREAD — choose what the form needs (teaching often suits a short thread). For a thread, set is_thread = true, put ordered segments in \`segments\` (each at or under ${platformSpec.max_chars} characters${
        platformSpec.max_thread_segments ? `, max ${platformSpec.max_thread_segments} segments` : ''
      }), and a one-line lead in \`body\`; do not number segments yourself. For a single post, set is_thread = false, leave \`segments\` empty, and put the full copy in \`body\` at or under ${platformSpec.max_chars} characters.`
    : `Format: a SINGLE ${label} post. Set is_thread = false, leave \`segments\` empty, and put the full copy in \`body\`, at or under ${platformSpec.max_chars} characters.`;

  const points = story.key_points.length ? `\nKey points:\n- ${story.key_points.join('\n- ')}` : '';

  return `You are writing one ${label} post for ${founderName}, a co-founder of BTS, in their personal voice.

## The story
Title: ${story.title}
Source: ${story.source_name}
Summary: ${story.summary}${points}
Link: ${story.url}

## ${formBlock}
${lengthNudge ? `\n${lengthNudge}\n` : ''}
## ${formatBlock}

## ${label} formatting (platform mechanics)
${platformFormatRules(platform, platformSpec, allowThread && form === 'teach', formatConfig ?? null)}
${repetitionBlock ? `\n${repetitionBlock}\n` : ''}
## Sourcing
- It is fine to reference or link the source story; write the post as ${founderName}'s own, not a news report.

## Brand voice — authoritative for this post
The brand voice below is ${founderName}'s voice for this account and governs persona, tone, vocabulary (use and avoid), signature devices, format and length, topic policy, and the Bitcoin capitalisation rule. Follow it exactly. Where it conflicts with the platform notes above, the voice wins on style; the platform's hard limits (char ceiling, fold) still stand.

${voiceBlock}

${NO_TOOL_INSTRUCTION}`;
}
