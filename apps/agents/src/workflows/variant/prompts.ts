import type { VariantContext, CharlieVariant } from './schemas.js';

// Pure prompt builders + text helpers for the Variant Generation workflow.
// Kept separate from index.ts so they can be unit-tested without invoking
// agents or the database.

/** Codepoint count — closer to how platforms count than UTF-16 `.length`. */
export function charCountOf(text: string): number {
  return Array.from(text).length;
}

/** A thread only when Charlie produced segments AND flagged it a thread. */
export function isThreadVariant(draft: CharlieVariant): boolean {
  return draft.is_thread && draft.segments.length > 0;
}

/** The copy a reader sees — the body for a single post, the joined numbered
 *  segments for a thread. Used for compliance review and char accounting. */
export function variantCopyText(draft: CharlieVariant): string {
  if (isThreadVariant(draft)) {
    return draft.segments.map((s, i) => `${i + 1}/ ${s.body}`).join('\n\n');
  }
  return draft.body;
}

// Reads the known fields off the loose campaigns.strategy JSONB.
function strategyField(strategy: Record<string, unknown>, key: string): string {
  const v = strategy[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join('; ');
  if (typeof v === 'string') return v;
  return '';
}

const NO_TOOL_INSTRUCTION =
  'Return ONLY the structured object. Do not call any tool (no persist_content_draft, no supabase tools) — persistence happens later in the workflow.';

/**
 * Platform-specific formatting conventions Charlie must follow rigorously, on top
 * of the structural format block (single vs thread) and the char ceiling. Kept
 * pure and separate so it can be unit-tested, and kept consistent with
 * docs/brand-voice.md (channel formality, content length, structure).
 */
export function platformFormatRules(
  platform: VariantContext['platform'],
  platformSpec: VariantContext['platformSpec'],
  wantsThread: boolean,
): string {
  const max = platformSpec.max_chars;

  if (platform === 'linkedin') {
    return [
      `- Open with a hook that lands in the first 1–2 lines: LinkedIn folds everything past ~140 characters behind a "…more", so the first line has to earn the expand.`,
      `- Short paragraphs — one or two sentences each, separated by a blank line. No walls of text.`,
      `- Aim for 1,200–2,500 characters: a deliberate, readable length well under the ${max}-character hard ceiling. Semi-formal register.`,
      `- Group any hashtags together at the very end, never sprinkled through the body.`,
    ].join('\n');
  }

  // twitter_x
  if (wantsThread) {
    return [
      `- 5–10 segments (≈7 is the sweet spot), one idea per segment, each at or under ${max} characters.`,
      `- The FIRST segment must hook and stand on its own — in the feed it is the only part most people see.`,
      `- Keep every segment scannable and self-contained. Conversational register. Hashtags sparingly — 1–2 across the whole thread.`,
    ].join('\n');
  }
  return [
    `- Aim for 100–250 characters — punchy, scannable, one clear idea. ${max} is the hard ceiling, not the target.`,
    `- Conversational register. At most 1–2 hashtags, and only where they earn their place.`,
  ].join('\n');
}

/**
 * Build Charlie's generation prompt for one variant. Threads are only requested
 * on twitter_x when the beat prefers one; LinkedIn is always a single post.
 */
export function buildCharliePrompt(ctx: VariantContext, instruction?: string): string {
  const { platform, platformSpec, strategy, beat } = ctx;
  const wantsThread = beat.prefer_thread && platform === 'twitter_x';
  const platformLabel = platform === 'twitter_x' ? 'X (Twitter)' : 'LinkedIn';

  const toneGuidance = strategyField(strategy, 'tone_guidance');
  const keyMessages = strategyField(strategy, 'key_messages');
  const hooks = strategyField(strategy, 'hooks');
  const doNotSay = strategyField(strategy, 'do_not_say');
  const hashtags = strategyField(strategy, 'hashtags');

  const formatBlock = wantsThread
    ? `Format: an X THREAD. Produce ordered segments, one idea per segment, each at or under ${platformSpec.max_chars} characters${
        platformSpec.max_thread_segments ? ` (max ${platformSpec.max_thread_segments} segments)` : ''
      }. Set is_thread = true, put the segments in \`segments\` (in order), and put a one-line lead/summary in \`body\`. Do not number the segments yourself — numbering is added on display.`
    : `Format: a SINGLE ${platformLabel} post. Set is_thread = false, leave \`segments\` empty, and put the full copy in \`body\`, at or under ${platformSpec.max_chars} characters.`;

  return `You are writing one social media variant for ${platformLabel}, for the account "${ctx.accountDisplayName}".

## The beat (the platform-agnostic idea every variant expresses)
${beat.title ? `Title: ${beat.title}\n` : ''}Core message: ${beat.core_message}
${beat.rationale ? `Why this beat exists: ${beat.rationale}` : ''}

## Campaign strategy
${toneGuidance ? `Tone guidance: ${toneGuidance}` : ''}
${keyMessages ? `Key messages: ${keyMessages}` : ''}
${hooks ? `Hooks to consider: ${hooks}` : ''}
${doNotSay ? `Do NOT say: ${doNotSay}` : ''}
${hashtags ? `Hashtags available (use sparingly, per platform norm): ${hashtags}` : ''}
${platformSpec.hashtag_guidance ? `Hashtag guidance: ${platformSpec.hashtag_guidance}` : ''}

## ${formatBlock}

## ${platformLabel} formatting — follow rigorously
${platformFormatRules(platform, platformSpec, wantsThread)}

## Hard rules
- "Bitcoin" (capital B) = the network/protocol; "bitcoin" (lowercase b) = the currency/unit. Get this right every time.
- No exclamation marks. No crypto-native hype (no "HODL", "to the moon", "diamond hands", rocket framing).
- Plain, confident advisor tone. Lead with the insight, not the throat-clearing. Explain jargon when you use it.
${instruction ? `\n## Requested change (regenerate addressing this)\n${instruction}\n` : ''}
## Voice — write in this register
${ctx.voiceBlock}

${NO_TOOL_INSTRUCTION}`;
}

/**
 * Build Lex's compliance-classification prompt. She picks a disclaimer key only
 * from the supplied list of active compliance_snippets keys.
 */
export function buildLexPrompt(draft: CharlieVariant, availableDisclaimerKeys: string[]): string {
  const copy = variantCopyText(draft);
  const keys = availableDisclaimerKeys.length
    ? availableDisclaimerKeys.join(', ')
    : '(none configured)';

  return `Classify this social media variant for financial-advice risk. You are advisory — you never block; your verdict is data the human reviews at the approval gate.

## The copy
${copy}

## Classify (exactly one)
- educational — explains a concept or BTS capability; no recommendation. No disclaimer.
- general_advice — touches product/allocation/strategy in a way a reader could act on, without being personal. Attach the keyed general-advice disclaimer.
- personal_opinion — reads as a personal recommendation or a founder's individual take. Flag for human judgement.

## Disclaimer
If a disclaimer is needed, set needs_disclaimer = true and choose disclaimer_key from EXACTLY these available keys: ${keys}. Otherwise set needs_disclaimer = false and disclaimer_key = null.

## Rationale
Give a one-breath rationale naming the specific phrase that moved your verdict. Do not rewrite the copy.`;
}
