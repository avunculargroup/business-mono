import type { VariantContext, CharlieVariant, FormatConfigCtx } from './schemas.js';

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

/**
 * Enforce an account's `thread_style` on Charlie's output. When `single-only`,
 * a thread draft is collapsed to a single post — `is_thread` cleared, `segments`
 * emptied, and (if `body` is empty) the segments folded into `body` so no copy is
 * lost. This is the deterministic guarantee behind the "no threads" setting: the
 * prompt asks for a single post, and this clamp holds even if Charlie ignores it.
 * A no-op for any other `thread_style` or a non-thread draft.
 */
export function applyThreadStyle(
  draft: CharlieVariant,
  formatConfig?: FormatConfigCtx,
): CharlieVariant {
  if (formatConfig?.thread_style !== 'single-only' || !isThreadVariant(draft)) return draft;
  const body = draft.body.trim().length > 0
    ? draft.body
    : draft.segments.map((s) => s.body).join('\n\n');
  return { ...draft, is_thread: false, segments: [], body };
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
 * Build the inline constraint lines from a structured FormatConfig or legacy
 * format notes text. These are injected directly into the platform mechanics
 * section so the LLM sees them as hard limits, not a soft deferral.
 */
function formatOverrideLines(fmt: FormatConfigCtx): string[] {
  if (!fmt) return [];
  const lines: string[] = [];

  if (fmt.legacy_notes) {
    lines.push(
      `- FORMAT OVERRIDE (hard limit): "${fmt.legacy_notes}" — follow this exactly, it supersedes the platform default length.`,
    );
    return lines;
  }

  if (fmt.word_count_min != null && fmt.word_count_max != null) {
    lines.push(
      `- WORD COUNT: ${fmt.word_count_min}–${fmt.word_count_max} words — hard limit for this account, overrides platform default.`,
    );
  } else if (fmt.word_count_max != null) {
    lines.push(
      `- WORD COUNT: up to ${fmt.word_count_max} words — hard limit for this account, overrides platform default.`,
    );
  } else if (fmt.word_count_min != null) {
    lines.push(
      `- WORD COUNT: at least ${fmt.word_count_min} words — minimum for this account.`,
    );
  }
  if (fmt.char_count_min != null && fmt.char_count_max != null) {
    lines.push(
      `- CHAR COUNT: ${fmt.char_count_min}–${fmt.char_count_max} characters — hard limit for this account, overrides platform default.`,
    );
  } else if (fmt.char_count_max != null) {
    lines.push(
      `- CHAR COUNT: up to ${fmt.char_count_max} characters — hard limit for this account, overrides platform default.`,
    );
  } else if (fmt.char_count_min != null) {
    lines.push(
      `- CHAR COUNT: at least ${fmt.char_count_min} characters — minimum for this account.`,
    );
  }
  if (fmt.register) lines.push(`- REGISTER: ${fmt.register}`);
  if (fmt.paragraphing && fmt.paragraphing !== 'platform-default') {
    lines.push(
      fmt.paragraphing === 'single-block'
        ? `- PARAGRAPHING: single block (no blank lines between sentences)`
        : `- PARAGRAPHING: short paragraphs (one or two sentences each, separated by a blank line)`,
    );
  }
  if (fmt.hashtag_use && fmt.hashtag_use !== 'platform-default') {
    lines.push(
      fmt.hashtag_use === 'none'
        ? `- HASHTAGS: none — do not include any hashtags`
        : `- HASHTAGS: sparingly — 1–2 maximum, only where they earn their place`,
    );
  }
  if (fmt.emoji_use && fmt.emoji_use !== 'platform-default') {
    lines.push(
      fmt.emoji_use === 'none'
        ? `- EMOJIS: none — do not include any emojis`
        : `- EMOJIS: sparingly — a light touch only, where it genuinely adds`,
    );
  }
  return lines;
}

/**
 * Platform *mechanics* Charlie must respect — the platform facts (char ceiling,
 * the LinkedIn fold point, thread segment behaviour) plus default styling
 * (length, register, paragraphing, hashtag use).
 *
 * When `formatConfig` is set, the account's format constraints are injected
 * inline as hard limits — not as a deferred pointer to the voice block — so
 * the LLM treats them as real constraints rather than soft hints. For very short
 * word-count limits (≤ 50 words) on LinkedIn, the fold/hook mechanic is replaced
 * with a note that the post is shorter than the fold point (the hook framing
 * would imply a longer format). Platform hard limits (char ceiling) always stay.
 */
export function platformFormatRules(
  platform: VariantContext['platform'],
  platformSpec: VariantContext['platformSpec'],
  wantsThread: boolean,
  formatConfig?: FormatConfigCtx,
): string {
  const max = platformSpec.max_chars;
  const fmt = formatConfig ?? null;
  const overrideLines = formatOverrideLines(fmt);
  const hasOverride = overrideLines.length > 0;

  if (platform === 'linkedin') {
    const isVeryShort =
      fmt && !fmt.legacy_notes && fmt.word_count_max != null && fmt.word_count_max <= 50;
    const foldMechanic = isVeryShort
      ? `- Keep the entire post under ${fmt!.word_count_max} words — shorter than LinkedIn's fold point, so the full post is visible without expanding.`
      : `- Open with a hook in the first 1–2 lines: LinkedIn folds everything past ~140 characters behind a "…more", so the first line has to earn the expand.`;
    const mechanics = [foldMechanic, `- Stay under the ${max}-character hard ceiling.`];
    const styling = [
      `- Short paragraphs — one or two sentences each, separated by a blank line. No walls of text.`,
      `- Aim for 1,200–2,500 characters, semi-formal register.`,
      `- Group any hashtags together at the very end, never sprinkled through the body.`,
    ];
    return [...mechanics, ...(hasOverride ? overrideLines : styling)].join('\n');
  }

  // twitter_x
  if (wantsThread) {
    const mechanics = [
      `- The FIRST segment must hook and stand on its own — in the feed it is the only part most people see.`,
      `- One idea per segment, each at or under ${max} characters${
        platformSpec.max_thread_segments ? ` (max ${platformSpec.max_thread_segments} segments)` : ''
      }.`,
    ];
    const styling = [
      `- 5–10 segments (≈7 is the sweet spot).`,
      `- Keep every segment scannable and self-contained. Conversational register. Hashtags sparingly — 1–2 across the whole thread.`,
    ];
    return [...mechanics, ...(hasOverride ? overrideLines : styling)].join('\n');
  }
  const mechanics = [`- ${max} characters is the hard ceiling.`];
  const styling = [
    `- Aim for 100–250 characters — punchy, scannable, one clear idea.`,
    `- Conversational register. At most 1–2 hashtags, and only where they earn their place.`,
  ];
  return [...mechanics, ...(hasOverride ? overrideLines : styling)].join('\n');
}

/**
 * Build Charlie's generation prompt for one variant. Threads are only requested
 * on twitter_x when the beat prefers one; LinkedIn is always a single post.
 */
export function buildCharliePrompt(ctx: VariantContext, instruction?: string): string {
  const { platform, platformSpec, strategy, beat } = ctx;
  const wantsThread =
    beat.prefer_thread &&
    platform === 'twitter_x' &&
    ctx.formatConfig?.thread_style !== 'single-only';
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

## ${platformLabel} formatting (platform mechanics)
${platformFormatRules(platform, platformSpec, wantsThread, ctx.formatConfig ?? null)}
${instruction ? `\n## Requested change (regenerate addressing this)\n${instruction}\n` : ''}
## Brand voice — authoritative for this post
The brand voice below governs persona, tone, vocabulary (use and avoid), signature devices, format and length, topic policy, and the Bitcoin capitalisation rule. Follow it exactly. Where it conflicts with the platform notes above, the voice wins on style; the platform's hard limits (char ceiling, fold) still stand.

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
