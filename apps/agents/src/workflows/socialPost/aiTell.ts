// Deterministic "AI-tell" linter for social-post drafts — a pure function, no model
// call, in keeping with the deterministic-before-LLM principle. It scores a draft on
// the constructions and cadence that read as machine-written (em-dash spray,
// rule-of-three lists, "not just X but Y", rhetorical question openers, stock filler,
// heavy hedging, hashtag stuffing) plus a grounding check (a post about a story that
// carried figures should cite one). Above a threshold the handler fires a SINGLE
// rewrite pass carrying the specific flags — so there is no latency cost on clean
// drafts. Kept pure so it can be unit-tested without agents or the DB.

export interface AiTellFlags {
  emDashes: number;
  ruleOfThreeLists: number;
  notJustButX: number;
  questionOpener: boolean;
  stockPhrases: string[];
  hedgeWords: number;
  hashtags: number;
  /** The story carried figures but the draft used none — ungrounded (proposal 3). */
  lacksConcreteSpecific: boolean;
  score: number;
}

// Stock filler that reads as machine-written. Lower-cased substring match. Kept
// distinct from docs/brand-voice.md's banned-terminology list (that is about hype;
// this is about AI cadence).
const STOCK_PHRASES = [
  "in today's landscape",
  "in today's world",
  'in an era of',
  'in a world where',
  'the reality is',
  "let's be honest",
  'make no mistake',
  'at the end of the day',
  "it's no secret",
  "here's the thing",
  'needle',
  'paradigm shift',
  'new normal',
  'game changer',
  'now more than ever',
  'more than ever before',
];

const HEDGE_WORDS = [
  'arguably',
  'perhaps',
  'somewhat',
  'fairly',
  'quite',
  'rather',
  'really',
  'very',
  'just',
  'maybe',
  'possibly',
  'sort of',
  'kind of',
];

/** Score threshold at or above which a rewrite pass is worth firing. */
export const AI_TELL_THRESHOLD = 3;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** The first non-empty line/sentence, for the question-opener check. */
function firstSentence(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  const stop = line.search(/[.!?]/);
  return stop === -1 ? line : line.slice(0, stop + 1);
}

/**
 * Score a draft's AI-tells. `storyHasNumbers` enables the grounding check: when the
 * source story carried figures, a draft with no digit of its own is flagged.
 */
export function scoreAiTells(text: string, opts: { storyHasNumbers?: boolean } = {}): AiTellFlags {
  const lower = text.toLowerCase();

  const emDashes = countMatches(text, /[—–]/g);
  // "word, word, and word" / "word, word word" triads (rule-of-three).
  const ruleOfThreeLists = countMatches(text, /\b[\w'-]+,\s+[\w'-]+,?\s+(?:and|or)\s+[\w'-]+/gi);
  const notJustButX = countMatches(text, /\bnot\s+(?:just|only|merely)\b[^.?!]*\bbut\b/gi);
  const questionOpener = /\?\s*$/.test(firstSentence(text));
  const stockPhrases = STOCK_PHRASES.filter((p) => lower.includes(p));
  const hedgeWords = HEDGE_WORDS.reduce(
    (n, w) => n + countMatches(lower, new RegExp(`\\b${w}\\b`, 'g')),
    0,
  );
  const hashtags = countMatches(text, /#[\w]+/g);
  const lacksConcreteSpecific = Boolean(opts.storyHasNumbers) && !/\d/.test(text);

  // Capped, weighted sum. Em-dash weight is deliberately low — a single em-dash is
  // fine (the voice may use them); only a spray contributes.
  let score = 0;
  score += Math.min(Math.max(emDashes - 1, 0), 2); // 0 for ≤1, up to 2 for a spray
  score += ruleOfThreeLists * 1.5;
  score += notJustButX * 2;
  score += questionOpener ? 1 : 0;
  score += stockPhrases.length * 2;
  score += hedgeWords >= 3 ? 1 : 0;
  score += hashtags > 2 ? hashtags - 2 : 0;
  // Grounding is the strongest single lever on "sounds like a person": a story that
  // carried figures deserves at least one in the post. Weighted to trip on its own.
  score += lacksConcreteSpecific ? AI_TELL_THRESHOLD : 0;

  return {
    emDashes,
    ruleOfThreeLists,
    notJustButX,
    questionOpener,
    stockPhrases,
    hedgeWords,
    hashtags,
    lacksConcreteSpecific,
    score,
  };
}

/**
 * A rewrite instruction naming only the offenders present, or null when the draft
 * scores below the threshold (the common case — no rewrite, no latency).
 */
export function aiTellRewriteInstruction(flags: AiTellFlags): string | null {
  if (flags.score < AI_TELL_THRESHOLD) return null;
  const notes: string[] = [];
  if (flags.emDashes >= 2) notes.push('Cut the em-dashes — restructure into plain sentences.');
  if (flags.ruleOfThreeLists > 0) notes.push('Break the rule-of-three list; use one or two items, not a tidy triad.');
  if (flags.notJustButX > 0) notes.push('Remove the "not just X but Y" construction; say the thing plainly.');
  if (flags.questionOpener) notes.push('Do not open with a rhetorical question; lead with a statement.');
  if (flags.stockPhrases.length > 0) notes.push(`Delete stock filler: ${flags.stockPhrases.join(', ')}.`);
  if (flags.hedgeWords >= 3) notes.push('Cut the hedging words; commit to the claim.');
  if (flags.hashtags > 2) notes.push('Reduce hashtags to at most one or two.');
  if (flags.lacksConcreteSpecific) notes.push('Anchor the post in a concrete specific from the story — a number, name, or date.');
  return notes.map((n) => `- ${n}`).join('\n');
}
