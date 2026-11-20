// Headline cards (2026-11-20): a short headline set in real type beside the
// social post image. The picture sets the mood; three to six words carry the
// meaning, so a reader who sees only the card gets the post's point.
//
// Lives in shared because three places agree on it: the agents' brief step
// lints the model's headlines before the reviewer sees them, the recompose
// handler re-lints a founder's edit, and the /content image slot shows the
// same flags inline before anything is queued.
// Spec: docs/features/social-post-image/feature-spec.md → Headline cards

/**
 * Words a headline may not use, from `.claude/skills/bts-design/references/naming.md`
 * → "Words to avoid": the advice-framing list, the hype list, and the two
 * restricted titles (s923C). Matched case-insensitively at word boundaries, so
 * "bestow" passes and "best" does not. Keep in step with naming.md.
 */
export const HEADLINE_PROHIBITED_TERMS = [
  'advice',
  'advise',
  'recommend',
  'should',
  'best',
  'top',
  'leading',
  'optimal',
  'guarantee',
  'proven',
  'edge',
  'alpha',
  'outperform',
  'crypto',
  'coin',
  'HODL',
  'moon',
  'degen',
  'rocket',
  'financial adviser',
  'financial planner',
] as const;

/** Headline length limits: a card is read at a glance. */
export const HEADLINE_MIN_WORDS = 2;
export const HEADLINE_MAX_WORDS = 7;
export const HEADLINE_MAX_CHARS = 48;
/** An all-caps word longer than this is shouting, not an acronym (RBA, MSCI, ASIC). */
const ACRONYM_MAX = 5;

export interface HeadlineLint {
  ok: boolean;
  flags: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Straight and typographic quotes, dashes and minus signs folded so a figure reads the same in both texts. */
function normaliseFigures(text: string): string {
  return text
    .replace(/[−–—]/g, '-')
    .replace(/[   ]/g, '')
    .replace(/\$/g, '');
}

/** Number-like tokens: digits with their sign, decimal and group separators. `$` and `%` are dropped by the comparison. */
const FIGURE = /[-−–]?\$?\d+(?:[.,  ]\d+)*/g;

/** Letters only, for judging case: "RBA's" → "RBA", "Who" → "Who". */
function letters(word: string): string {
  return word.replace(/[’']s$/i, '').replace(/[^\p{L}]/gu, '');
}

const isAllCaps = (w: string) => w.length >= 2 && w === w.toUpperCase() && w !== w.toLowerCase();
const isCapitalised = (w: string) => w.length > 0 && w[0] !== w[0]!.toLowerCase() && w[0] === w[0]!.toUpperCase();

/**
 * Lint one headline against the post it sits beside. Pure. Flags, each a
 * sentence a founder can act on:
 *   - length: 2–7 words and at most 48 characters;
 *   - ending: a full stop or a question mark, never an exclamation mark;
 *   - sentence case: first letter uppercase, no all-caps word longer than an
 *     acronym, and no Title Case (more than half the later words capitalised,
 *     not counting acronyms or words the post itself capitalises);
 *   - words to avoid (HEADLINE_PROHIBITED_TERMS);
 *   - figures: every number must appear in the post. A figure not in the post is invented.
 */
export function lintHeadline(text: string, postCopy: string): HeadlineLint {
  const flags: string[] = [];
  const t = (typeof text === 'string' ? text : '').trim().replace(/[ \t\r\n]+/g, ' ');
  if (!t) return { ok: false, flags: ['The headline is empty.'] };

  const words = t.split(' ');
  if (words.length < HEADLINE_MIN_WORDS || words.length > HEADLINE_MAX_WORDS) {
    flags.push(`Use ${HEADLINE_MIN_WORDS} to ${HEADLINE_MAX_WORDS} words; this has ${words.length}.`);
  }
  if (t.length > HEADLINE_MAX_CHARS) flags.push(`Keep it to ${HEADLINE_MAX_CHARS} characters; this has ${t.length}.`);

  if (t.includes('!')) flags.push('No exclamation marks.');
  if (!/[.?]$/.test(t)) flags.push('End with a full stop or a question mark.');

  const first = t.match(/\p{L}/u)?.[0];
  if (first && first !== first.toUpperCase()) flags.push('Start with a capital letter.');
  const shouting = words.map(letters).filter((w) => isAllCaps(w) && w.length > ACRONYM_MAX);
  if (shouting.length > 0) flags.push(`Use sentence case, not capitals: ${shouting.join(', ')}.`);
  const later = words.slice(1).map(letters).filter((w) => w.length > 0);
  const inPost = (w: string) => new RegExp(`(?<![\\p{L}])${escapeRegex(w)}(?![\\p{L}])`, 'u').test(postCopy);
  const titled = later.filter((w) => isCapitalised(w) && !(isAllCaps(w) && w.length <= ACRONYM_MAX) && !inPost(w));
  if (later.length > 0 && titled.length > later.length / 2) flags.push('Use sentence case, not Title Case.');

  const banned = HEADLINE_PROHIBITED_TERMS.filter((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(t));
  if (banned.length > 0) flags.push(`Avoid these words: ${banned.join(', ')}.`);

  const post = normaliseFigures(postCopy);
  const missing = (t.match(FIGURE) ?? []).filter((raw) => {
    const fig = normaliseFigures(raw);
    return !new RegExp(`(?<!\\d)${escapeRegex(fig)}(?!\\d)`).test(post);
  });
  if (missing.length > 0) flags.push(`Figure not in the post: ${missing.join(', ')}.`);

  return { ok: flags.length === 0, flags };
}

/**
 * The kicker over the headline, by the story's news category. A constant so the
 * founders can change the labels later; an unknown or missing category has no kicker.
 */
export const KICKER_LABELS: Readonly<Record<string, string>> = {
  regulatory: 'REGULATION',
  corporate: 'TREASURY',
  macro: 'MACRO',
  international: 'GLOBAL',
};

export function kickerFor(category: string | null | undefined, labels: Readonly<Record<string, string>> = KICKER_LABELS): string | null {
  if (typeof category !== 'string') return null;
  return labels[category.trim().toLowerCase()] ?? null;
}

/** Straight quotes and apostrophes to typographic ones, for the printed headline. */
export function typographicQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{])'/g, '$1‘')
    .replace(/'/g, '’');
}

const HEADLINE_ALT_PREFIX = /^“[^”]*” — /;

/** The stored alt text of a headline card: the headline first, so a screen reader hears what the card says. */
export function headlineAltText(headline: string | null, altText: string): string {
  const description = stripHeadlineFromAlt(altText);
  return headline ? `“${headline}” — ${description}` : description;
}

/** The picture's own description, without a headline prefix added by headlineAltText. */
export function stripHeadlineFromAlt(altText: string): string {
  return altText.trim().replace(HEADLINE_ALT_PREFIX, '');
}
