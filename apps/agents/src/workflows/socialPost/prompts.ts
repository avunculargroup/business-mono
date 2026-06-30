import type { Platform } from '../variant/schemas.js';
import { platformFormatRules } from '../variant/prompts.js';
import { voiceBlockHasFormatNotes } from '../../lib/voicePrompt.js';
import type { StoryCandidate, SocialPostForm } from './select.js';

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
 */
export function buildEditorSelectionPrompt(
  candidates: StoryCandidate[],
  voiceBlock: string,
  founderName: string,
): string {
  const lines = candidates.map((c, i) => candidateLine(c, i)).join('\n\n');
  return `You are choosing one Bitcoin/treasury news story for ${founderName} to post about today, and the form their post should take.

Pick the SINGLE story from the candidates below that best fits ${founderName}'s individual voice and the topics they are credible on — not simply the highest-ranked story. Then choose the post form:
- **share_with_context** — share the story with ${founderName}'s perspective and what it means for Australian businesses. Best when the news itself is the point.
- **teach** — use the story as a hook to teach the underlying concept a sceptical CFO needs to understand. Best when the story surfaces a principle worth explaining.

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
  founderName: string;
}): string {
  const { story, form, platform, platformSpec, voiceBlock, founderName } = params;
  const label = PLATFORM_LABEL[platform];
  const allowThread = platform === 'twitter_x';

  const formBlock =
    form === 'teach'
      ? 'Form: TEACH. Use the story as a hook, then teach the underlying concept a sceptical CFO needs to understand. Lead with the principle, ground it in the news.'
      : 'Form: SHARE WITH CONTEXT. Share the story with your perspective on what it means for Australian businesses. Add the insight a reader would miss skimming the headline.';

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

## ${formatBlock}

## ${label} formatting (platform mechanics)
${platformFormatRules(platform, platformSpec, allowThread && form === 'teach', voiceBlockHasFormatNotes(voiceBlock))}

## Sourcing
- It is fine to reference or link the source story; write the post as ${founderName}'s own, not a news report.

## Brand voice — authoritative for this post
The brand voice below is ${founderName}'s voice for this account and governs persona, tone, vocabulary (use and avoid), signature devices, format and length, topic policy, and the Bitcoin capitalisation rule. Follow it exactly. Where it conflicts with the platform notes above, the voice wins on style; the platform's hard limits (char ceiling, fold) still stand.

${voiceBlock}

${NO_TOOL_INSTRUCTION}`;
}
