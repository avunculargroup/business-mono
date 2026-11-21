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

const UNIT_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SMALL_SCALES: Readonly<Record<string, number>> = { dozen: 12, hundred: 100 };
/** Scales that multiply everything before them. "million" and up are kept as words, as posts write them ("18 million"). */
const LARGE_SCALES: Readonly<Record<string, number>> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const WORDED_SCALES = new Set(['million', 'billion', 'trillion']);
const NUMBER_WORD = [...Object.keys(UNIT_WORDS), ...Object.keys(SMALL_SCALES), ...Object.keys(LARGE_SCALES)].join('|');
/**
 * A run of number words: "eighteen", "twenty-one", "two hundred and five", "three million".
 * A scale word after digits ("1.3 trillion") is part of that figure, not a run of its own.
 */
const NUMBER_RUN = new RegExp(`(?<!\\d[.,]?\\s*)\\b(?:${NUMBER_WORD})(?:(?:[\\s-]+and)?[\\s-]+(?:${NUMBER_WORD}))*\\b`, 'gi');

function wordsValue(words: string[]): number {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w in UNIT_WORDS) current += UNIT_WORDS[w]!;
    else if (w in SMALL_SCALES) current = (current || 1) * SMALL_SCALES[w]!;
    else if (w in LARGE_SCALES) {
      total += (current || 1) * LARGE_SCALES[w]!;
      current = 0;
    }
  }
  return total + current;
}

/**
 * Spelled-out numbers as digits, so a figure reads the same in words or
 * digits: "eighteen" → "18", "twenty-one" → "21", "two hundred" → "200",
 * "a dozen" → "a 12". A run ending in million, billion or trillion keeps that
 * word ("eighteen million" → "18 million"), as posts write it. Pure.
 */
export function numberWordsToDigits(text: string): string {
  return text.replace(NUMBER_RUN, (run) => {
    const words = run.toLowerCase().split(/[\s-]+/).filter((w) => w !== 'and');
    const last = words[words.length - 1]!;
    if (WORDED_SCALES.has(last) && !words.slice(0, -1).some((w) => w in LARGE_SCALES)) {
      return `${wordsValue(words.slice(0, -1)) || 1} ${last}`;
    }
    return String(wordsValue(words));
  });
}

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
 *   - figures: every number, in digits or in words, must appear in the post
 *     (in either form). A figure not in the post is invented.
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

  // The first letter, past leading quotes, currency signs and punctuation. A
  // headline that opens on a figure ("$1.3 trillion.", "18 years.", "−15.")
  // has no letter to capitalise; the figure check still applies to it.
  const lead = t.match(/[\p{L}\p{N}]/u)?.[0];
  if (lead && /\p{L}/u.test(lead) && lead !== lead.toUpperCase()) flags.push('Start with a capital letter.');
  const shouting = words.map(letters).filter((w) => isAllCaps(w) && w.length > ACRONYM_MAX);
  if (shouting.length > 0) flags.push(`Use sentence case, not capitals: ${shouting.join(', ')}.`);
  const later = words.slice(1).map(letters).filter((w) => w.length > 0);
  const inPost = (w: string) => new RegExp(`(?<![\\p{L}])${escapeRegex(w)}(?![\\p{L}])`, 'u').test(postCopy);
  const titled = later.filter((w) => isCapitalised(w) && !(isAllCaps(w) && w.length <= ACRONYM_MAX) && !inPost(w));
  if (later.length > 0 && titled.length > later.length / 2) flags.push('Use sentence case, not Title Case.');

  const banned = HEADLINE_PROHIBITED_TERMS.filter((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(t));
  if (banned.length > 0) flags.push(`Avoid these words: ${banned.join(', ')}.`);

  // Spelled-out numbers count: "eighteen" must match an 18 (or "eighteen") in the post.
  const post = normaliseFigures(numberWordsToDigits(postCopy));
  const figures = [...(t.match(FIGURE) ?? []), ...(t.match(NUMBER_RUN) ?? [])];
  const missing = figures.filter((raw) => {
    const fig = normaliseFigures(numberWordsToDigits(raw));
    return !new RegExp(`(?<!\\d)${escapeRegex(fig)}(?!\\d)`).test(post);
  });
  if (missing.length > 0) flags.push(`Figure not in the post: ${missing.join(', ')}.`);

  return { ok: flags.length === 0, flags };
}

/** Kicker limits: a subject in one to three plain words. */
export const KICKER_MAX_WORDS = 3;
export const KICKER_MAX_CHARS = 24;

/**
 * Internal ingest buckets (`news_items.category`). Never printed: a kicker
 * that is one of these on its own is the model echoing the category.
 */
export const KICKER_BUCKET_WORDS = ['regulatory', 'corporate', 'macro', 'international', 'general'] as const;

/** The company name in any register (naming.md): a kicker names the post's subject, never us. */
const COMPANY_NAME = /\b(?:BTS|Bitcoin Treasury Solutions|Treasury Solutions)\b/i;

/**
 * Lint the kicker over a headline (2026-11-21): the post's subject as a reader
 * would name it ("Bitcoin security", "Interest rates"), written by the brief.
 * Pure. Code uppercases it for printing. A kicker that fails is not printed;
 * there is no fallback.
 */
export function lintKicker(text: string): HeadlineLint {
  const flags: string[] = [];
  const t = (typeof text === 'string' ? text : '').trim().replace(/\s+/g, ' ');
  if (!t) return { ok: false, flags: ['The kicker is empty.'] };

  const words = t.split(' ');
  if (words.length > KICKER_MAX_WORDS) flags.push(`Use 1 to ${KICKER_MAX_WORDS} words; this has ${words.length}.`);
  if (t.length > KICKER_MAX_CHARS) flags.push(`Keep it to ${KICKER_MAX_CHARS} characters; this has ${t.length}.`);
  if (!/^[\p{L} -]+$/u.test(t)) flags.push('Use letters, spaces and hyphens only.');

  const banned = HEADLINE_PROHIBITED_TERMS.filter((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(t));
  if (banned.length > 0) flags.push(`Avoid these words: ${banned.join(', ')}.`);
  if ((KICKER_BUCKET_WORDS as readonly string[]).includes(t.toLowerCase())) {
    flags.push('Name the subject, not an internal category.');
  }
  if (COMPANY_NAME.test(t)) flags.push('Name the subject, not the company.');

  return { ok: flags.length === 0, flags };
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
