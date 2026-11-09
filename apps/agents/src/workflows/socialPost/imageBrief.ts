import { z } from 'zod';
import {
  MAX_BRIEF_CONCEPTS,
  MIN_BRIEF_CONCEPTS,
  readStoredBrief,
  type ConceptReview,
  type ImageBrief as SharedImageBrief,
  type Layout,
} from '@platform/shared';
import type { StoryCandidate } from './select.js';

// The image brief: the only part of an image an LLM decides. It names the
// post's hook (its most specific phrase), reads the post for its tension, then
// proposes six concepts about that hook, each a familiar symbol everyone
// already knows with one visible twist, and a layout. It never writes the
// prompt the image model receives (buildImagePrompt does).
//
// The bar is the half-second phone test: someone scrolling past at about 350px
// recognises the symbol and gets the twist without reading the post.
//   v1.0  a familiar symbol, no twist ("Twenty years" became an hourglass): bland.
//   v1.1  no familiar symbols, a half-drawn pencil concept: obscure, it needed
//         a caption, and nobody in a feed reads the caption.
//   v1.2  both: a symbol everyone knows, changed in one way.
//
// The pure linter (lintImageBrief, in @platform/shared) drops flagged concepts
// before a render is paid for; if none survive, one re-brief carries the flags,
// then skip. Never a loop: the same shape as the AI-tell gate.
//
// Then a text-only reviewer (the editor) scores the clean concepts, and
// rankConcepts shortlists the top three to render. Judging an idea costs a
// fraction of a cent; a render costs cents. The reviewer is acted on: when
// fewer than three ideas pass, one re-brief carries its notes, and any slot
// still empty is filled with the best-scoring rejected idea. When the reviewer
// itself fails, the shortlist is the brief's own order.

const conceptSchema = z.object({
  tension: z.string().max(200),
  symbol: z.string().max(200), // a familiar, instantly recognisable object
  twist: z.string().max(200), // the one visible change that ties it to the post
  subject: z.string().max(200), // the symbol with its twist, as it will be drawn
  layout: z.string(), // validated against active layouts by the linter
  alt_text: z.string().max(300),
});

/**
 * What the model is asked to return. It carries no minimum on purpose:
 * structured output with errorStrategy 'fallback' turns any schema failure
 * into the fallback brief, which is a skip, so enforcing six here would turn a
 * four-concept brief into no image at all. A short brief is reviewed as it is.
 */
export const imageBriefOutputSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  hook: z.string().max(120), // the post's most specific, concrete phrase
  concepts: z.array(conceptSchema).max(MAX_BRIEF_CONCEPTS),
});

/** The brief's contract: a non-skip brief proposes exactly MIN_BRIEF_CONCEPTS concepts; a skip proposes none. */
export const imageBriefSchema = imageBriefOutputSchema.superRefine((brief, ctx) => {
  if (!brief.skip && brief.concepts.length < MIN_BRIEF_CONCEPTS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['concepts'],
      message: `A brief that does not skip proposes ${MIN_BRIEF_CONCEPTS} concepts; this one has ${brief.concepts.length}.`,
    });
  }
});
export type ImageBrief = z.infer<typeof imageBriefSchema>;
export type ImageConcept = z.infer<typeof conceptSchema>;
// The schema and the shared interface must describe the same shape: a drift
// fails typecheck here rather than at render time.
const _sameShape: [ImageBrief, SharedImageBrief] extends [SharedImageBrief, ImageBrief] ? true : never = true;
void _sameShape;

export { lintImageBrief, lintImageConcept, imageBriefRewriteInstruction } from '@platform/shared';

export const FALLBACK_IMAGE_BRIEF: ImageBrief = {
  skip: true,
  skip_reason: 'Brief generation failed.',
  hook: '',
  concepts: [],
};

/** At most this many concepts are rendered per run: the reviewer's shortlist. */
export const MAX_CANDIDATES = 3;

/** How many recent runs the brief is shown, to avoid repeating itself. */
export const RECENT_RUNS = 5;

export interface ImageHistory {
  /**
   * Symbols of recent runs' selected images, most recent first. Rows made
   * before v1.2 have no symbol; their subject stands in.
   */
  symbols: string[];
  /** Layouts of recent runs' selected images, most recent first. v1.0 rows have none. */
  layouts: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * What recent runs looked like, from their selected images, most recent first.
 * One run writes a row per platform crop and a set of candidate groups, so
 * rows are deduped by candidate set, falling back to generation group for rows
 * made before sets existed. Reads every stored brief shape and tolerates a
 * null/non-array read (degrades to no history).
 */
export function recentImageHistory(rows: unknown, maxRuns = RECENT_RUNS): ImageHistory {
  const history: ImageHistory = { symbols: [], layouts: [] };
  if (!Array.isArray(rows)) return history;
  const seenRuns = new Set<string>();
  for (const r of rows as Row[]) {
    if (r?.is_selected === false) continue;
    const run =
      (typeof r?.candidate_set_id === 'string' && r.candidate_set_id) ||
      (typeof r?.generation_group_id === 'string' && r.generation_group_id) ||
      null;
    if (run) {
      if (seenRuns.has(run)) continue;
      seenRuns.add(run);
    }
    const brief = readStoredBrief(r?.image_brief);
    if (!brief) continue;
    const symbol = brief.symbol ?? brief.subject;
    if (symbol) history.symbols.push(symbol);
    if (brief.layout) history.layouts.push(brief.layout);
    if (seenRuns.size >= maxRuns) break;
  }
  return history;
}

/** The layout the last two runs both used, which the next run may not use a third time. */
export function layoutToRest(history: ImageHistory): string | null {
  const [a, b] = history.layouts;
  return a && a === b ? a : null;
}

export interface ImageBriefPromptParams {
  /** Absent when a regenerate cannot find the run's story; the post carries the brief alone. */
  story?: Pick<StoryCandidate, 'title' | 'summary' | 'key_points'> | null;
  form?: string | null;
  /** The persisted post copy the image sits beside (LinkedIn, else X). */
  postCopy: string;
  layouts: Layout[];
  history: ImageHistory;
  /** The canon's prohibited terms, so the brief avoids them before the linter has to. */
  prohibitedTerms: string[];
  /** Linter flags from a first attempt, for the single re-brief. */
  rewriteInstruction?: string | null;
  /** The reviewer's notes on rejected concepts, for the single reviewer-driven re-brief. */
  reviewerInstruction?: string | null;
}

export function buildImageBriefPrompt(p: ImageBriefPromptParams): string {
  const layoutList = p.layouts.map((l) => `- ${l.key} (${l.label}): ${l.description}`).join('\n');
  const story = p.story
    ? `## The story behind it
${p.story.title}
${p.story.summary}
Key points:
${p.story.key_points.length > 0 ? p.story.key_points.map((k) => `- ${k}`).join('\n') : '(none)'}

`
    : '';
  const form = p.form ? ` (form: ${p.form.replace(/_/g, ' ')})` : '';

  const historyLines: string[] = [];
  if (p.history.symbols.length > 0) {
    historyLines.push(`Recent images used: ${p.history.symbols.join('; ')}. Do not use any of these symbols again.`);
  }
  const rest = layoutToRest(p.history);
  if (rest) {
    historyLines.push(`The last two images both used the ${rest} layout. Do not use ${rest} in any concept.`);
  }
  const history = historyLines.length > 0 ? `\n\n## Recent images\n${historyLines.join('\n')}` : '';
  const avoid =
    p.prohibitedTerms.length > 0 ? `\n- Never use these, anywhere: ${p.prohibitedTerms.join(', ')}.` : '';
  const rewrite = p.rewriteInstruction
    ? `\n\n## Re-brief: none of your concepts could be used, for these reasons\n${p.rewriteInstruction}`
    : '';
  const reviewer = p.reviewerInstruction
    ? `\n\n## Re-brief: a reviewer rejected these concepts\n${p.reviewerInstruction}`
    : '';

  return `Propose an image to sit beside a founder's social post. You are not writing an image prompt: the house style (a bold two-colour linocut), palette and prohibitions are fixed elsewhere. Your job is to find the idea worth printing.

## The post${form}
${p.postCopy}

${story}## The half-second test
The image is seen at phone size by someone scrolling past. In half a second they must recognise the subject and get the idea, without reading the post. A clever image that needs a caption fails.

## First, the hook
hook: the single most specific, concrete phrase in the post. It is the thing a reader would quote back, not the topic: "capital buffers", not "regulation"; "Twenty years", not "US debt". Prefer a noun phrase. Copy it from the post.

Every concept must be about the hook, not the post's general topic. Visual puns on the hook's words are welcome, and often the strongest option: "capital buffers" can be railway buffer stops.

## Then work it out in this order, for each concept
1. tension: the surprising or uneasy idea in this post, in one sentence. Not its topic.
2. symbol: an object, place or tool everyone already knows. Instant recognition matters more than originality.
3. twist: one change to the symbol that ties it to the hook and the tension. One change only. It must be visible in the picture, not explained in words.
4. subject: one sentence describing the symbol with its twist, as it will be printed. One big subject.
5. layout: exactly one key from this list:
${layoutList}
6. alt_text: what the image shows, for a screen reader, plainly, under 300 characters. Describe the picture, not the post's argument.

Then test each concept: would someone scrolling past at phone size recognise the symbol and get the twist without reading the post? If not, pick a simpler symbol.

The twist is a visible physical state, never a moment in time. "About to", "not yet", "paused", "poised", "mid-stroke" and "waiting" cannot be seen in a still image. Half-finished is fine when the half can be seen: half the pitch lined, half the shelf full.

Physics: if the twist involves weight, balance, light, motion or water, describe it so it reads correctly. A weighted pan sits lower; light comes from its source; water finds its level.

## Examples
- Weak, a symbol with no twist: "Twenty years" became an hourglass. True, but it says nothing.
- Weak, no symbol: a half-drawn bridge pier for a regulator's consultation paper. It needs explaining.
- Weak, the topic and not the hook: "capital buffers" became a balance scale. It says "regulation", and this one had the weighted pan sitting higher.
- Weak, the topic and not the hook: "capital buffers" became a closed farm gate.
- Weak, generic writing and a pause nobody can see: "the playbook" became a fountain pen lifted mid-stroke.
- Strong, a pun on the hook's words: "capital buffers" became a heavy railway buffer stop printed in gold, a black rail running straight into it.
- Strong, a pun on "the game": "writing the playbook, not banning the game" became a football on a kicking tee on a freshly marked pitch, its touchline painted in gold.
- Strong: "clarity's coming" became a lighthouse throwing one solid gold beam through fog.

## Rules
- Return exactly six concepts with six different symbols, using at least two different layouts. Breadth matters more than polish: a reviewer will shortlist them.
- Draw the six from at least four different domains (sport, home, nature, transport, building, kitchen, travel and so on), at most two from any one domain.
- At least two concepts pun on the hook's literal words.
- No symbol whose meaning depends on writing or letters: pens writing, type, documents, signs, newspapers, seals, books shown open. A closed book is fine.
- No text, letters, numbers or figures anywhere in the picture. Images cannot carry them.
- No coins, currency symbols, charts, arrows or anything that implies a price going up or down. No people's faces.${avoid}
- Keep the bottom-right corner of the picture empty.
- If the post has no honest visual, set skip = true with a short skip_reason, an empty hook and no concepts. Skipping is a good outcome, not a failure.${history}${rewrite}${reviewer}`;
}

// ── The reviewer: shortlist before any render is paid for ──────────────────────

const scoreSchema = z.number().int().min(1).max(5);

export const critiqueSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number().int(), // the concept's number in the prompt, from 1
      recognisable: scoreSchema, // symbol recognised in half a second at phone size
      twist_visible: scoreSchema, // the twist is in the picture, not in words
      on_hook: scoreSchema, // about the hook, not the general topic
      physics_ok: z.boolean(),
      needs_text: z.boolean(), // the picture needs visible letters, numbers or writing to read
      note: z.string().max(160),
    }),
  ),
});
export type Critique = z.infer<typeof critiqueSchema>;
export type ConceptScore = Critique['scores'][number];

export interface ImageCriticPromptParams {
  postCopy: string;
  hook: string;
  /** Lint-clean concepts, in brief order; numbered from 1 in the prompt. */
  concepts: ImageConcept[];
}

export function buildImageCriticPrompt(p: ImageCriticPromptParams): string {
  const list = p.concepts
    .map(
      (c, i) => `${i + 1}. Symbol: ${c.symbol}
   Twist: ${c.twist}
   Subject: ${c.subject}`,
    )
    .join('\n');
  return `You review image ideas for a founder's social post before any are printed. Each idea will be a bold two-colour linocut seen at phone size by someone scrolling past. Be strict: most ideas should not score well, and a polite middle score helps nobody.

## The post
${p.postCopy}

## The hook
${p.hook || '(none given: judge on_hook against the post\'s most specific phrase)'}

## The ideas
${list}

## Score every idea, 1 to 5
- recognisable: would someone recognise the symbol in half a second at phone size?
- twist_visible: is the twist in the picture itself, not in words or a caption? A plain symbol with no twist scores 1.
- on_hook: is it about the hook, not the post's general topic? A picture of the general topic scores 1.
- physics_ok: false if the picture would get weight, balance, light, motion or water visibly wrong.
- needs_text: true if the picture needs visible letters, numbers or writing to read.
- note: one short line on the idea's strength or flaw, under 160 characters.

Return one entry per idea, with index set to the idea's number above.

## Calibration (hook: "capital buffers")
- A balance scale with the weighted pan sitting higher: recognisable 5, twist_visible 1, on_hook 1, physics_ok false. It says "regulation", and the weighted pan should sit lower.
- A closed farm gate: recognisable 5, twist_visible 1, on_hook 1, physics_ok true. A picture of the topic.
- A heavy railway buffer stop in gold, a black rail running straight into it: recognisable 5, twist_visible 4, on_hook 5, physics_ok true. A pun on the exact words, read in half a second.
- A twist that is a moment in time ("about to", "paused", "poised") scores 2 or less on twist_visible: a still image cannot show it.`;
}

export interface RankedConcept {
  concept: ImageConcept;
  /** recognisable + twist_visible + on_hook; null when unscored or on a fallback. */
  total: number | null;
  /** 1 for the top pick. */
  rank: number;
  /** The reviewer's scores, when it scored this concept and the ranking did not fall back. */
  score: ConceptScore | null;
  /** A rejected concept rendered because too few passed. */
  filled: boolean;
}

export interface Ranking {
  /** Survivors first, best first; then, if too few survived, the best soft rejects. */
  ranked: RankedConcept[];
  /** Concepts the filter rejected, by their 1-based number; empty on a fallback. */
  dropped: Array<{ index: number; reason: string }>;
  /** How many concepts passed the filter (not counting fills). */
  passed: number;
  /** True when the reviewer's output could not be used: the ranking is the brief's order. */
  fallback: boolean;
}

/**
 * Why a critique cannot be ranked on, or null when it can. The same conditions
 * as rankConcepts' fallback, spelled out for the run's record. Out-of-range
 * indices are the likeliest cause in round two: the reviewer has just seen
 * round one's numbering and may carry on from it.
 */
export function critiqueProblem(critique: unknown, count: number): string | null {
  if (critique === null || critique === undefined) return 'no critique returned';
  const parsed = critiqueSchema.safeParse(critique);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `malformed critique: ${issue?.path.join('.') || 'root'} ${issue?.message ?? ''}`.trim();
  }
  if (parsed.data.scores.length === 0) return 'no scores returned';
  const seen = new Set<number>();
  const outside: number[] = [];
  const twice: number[] = [];
  for (const s of parsed.data.scores) {
    if (s.index < 1 || s.index > count) outside.push(s.index);
    else if (seen.has(s.index)) twice.push(s.index);
    seen.add(s.index);
  }
  const problems = [
    outside.length > 0 ? `indices outside 1–${count}: ${outside.join(', ')}` : null,
    twice.length > 0 ? `scored twice: ${[...new Set(twice)].join(', ')}` : null,
  ].filter(Boolean);
  return problems.length > 0 ? problems.join('; ') : null;
}

/** Faults no score can outweigh: such a concept fills a slot only when every concept has one. */
function hardFault(s: ConceptScore): string | null {
  if (!s.physics_ok) return 'physics reads wrong';
  if (s.needs_text) return 'needs visible text to read';
  return null;
}

/** Why the filter rejects a scored concept, or null to keep it. */
function dropReason(s: ConceptScore): string | null {
  const hard = hardFault(s);
  if (hard) return hard;
  const low = (['recognisable', 'twist_visible', 'on_hook'] as const).filter((k) => s[k] <= 2);
  return low.length > 0 ? `scored 2 or less on ${low.join(', ')}` : null;
}

const totalOf = (s: ConceptScore) => s.recognisable + s.twist_visible + s.on_hook;

/**
 * Shortlist the concepts to render from the reviewer's scores. Pure.
 * Rejects a concept with physics_ok false, needs_text true or any score of 2
 * or less. Survivors are ordered by total (brief order breaks ties), unscored
 * ones after every scored one, and the top `max` taken. If fewer than `max`
 * survive, the remaining slots are filled with the highest-total soft rejects
 * (never a physics or needs-text fault while anything else is left; when every
 * concept has one, the highest-total of those, so a run always renders). Only a
 * missing or malformed critique falls back to the brief's own order.
 */
export function rankConcepts(concepts: ImageConcept[], critique: Critique | null, max = MAX_CANDIDATES): Ranking {
  const fallback = (): Ranking => ({
    ranked: concepts.slice(0, max).map((concept, i) => ({ concept, total: null, rank: i + 1, score: null, filled: false })),
    dropped: [],
    passed: 0,
    fallback: true,
  });
  const parsed = critiqueSchema.safeParse(critique);
  if (!parsed.success || parsed.data.scores.length === 0) return fallback();
  const byIndex = new Map<number, ConceptScore>();
  for (const s of parsed.data.scores) {
    // An index outside the list, or scored twice, means the reviewer lost track.
    if (s.index < 1 || s.index > concepts.length || byIndex.has(s.index)) return fallback();
    byIndex.set(s.index, s);
  }

  type Entry = { concept: ImageConcept; order: number; score: ConceptScore | null; total: number | null };
  const dropped: Ranking['dropped'] = [];
  const passed: Entry[] = [];
  const softRejects: Entry[] = [];
  const hardRejects: Entry[] = [];
  concepts.forEach((concept, i) => {
    const score = byIndex.get(i + 1) ?? null;
    const entry = { concept, order: i, score, total: score ? totalOf(score) : null };
    const reason = score ? dropReason(score) : null;
    if (!reason) {
      passed.push(entry);
      return;
    }
    dropped.push({ index: i + 1, reason });
    if (score && !hardFault(score)) softRejects.push(entry);
    else if (score) hardRejects.push(entry);
  });

  const byTotal = (a: Entry, b: Entry) => {
    if (a.total === null || b.total === null) {
      if (a.total !== b.total) return a.total === null ? 1 : -1;
      return a.order - b.order;
    }
    return b.total - a.total || a.order - b.order;
  };
  passed.sort(byTotal);
  softRejects.sort(byTotal);
  hardRejects.sort(byTotal);
  // A hard fault never fills a slot while anything else can; only when every
  // concept has one does the best of them render, so a run always has an image.
  const fills = passed.length + softRejects.length > 0 ? softRejects : hardRejects;
  const picks = [
    ...passed.slice(0, max).map((e) => ({ ...e, filled: false })),
    ...fills.slice(0, Math.max(0, max - passed.length)).map((e) => ({ ...e, filled: true })),
  ];
  return {
    ranked: picks.map((e, i) => ({ concept: e.concept, total: e.total, rank: i + 1, score: e.score, filled: e.filled })),
    dropped,
    passed: passed.length,
    fallback: false,
  };
}

/** The review to store beside a rendered concept, or null when it was unscored or the ranking fell back. */
export function storedReview(r: RankedConcept): ConceptReview | null {
  if (!r.score) return null;
  const { recognisable, twist_visible, on_hook, physics_ok, needs_text, note } = r.score;
  return { recognisable, twist_visible, on_hook, physics_ok, needs_text, note, total: r.total, rank: r.rank };
}

export interface RejectedConcept {
  symbol: string;
  note: string;
  scores: Pick<ConceptScore, 'recognisable' | 'twist_visible' | 'on_hook' | 'physics_ok' | 'needs_text'>;
}

/** What a rejected concept fell down on most: a hard fault, else its lowest score. */
function weakest(scores: RejectedConcept['scores']): string {
  if (!scores.physics_ok) return 'physics reads wrong';
  if (scores.needs_text) return 'needs visible text';
  const dims = [
    ['recognisable', scores.recognisable],
    ['twist_visible', scores.twist_visible],
    ['on_hook', scores.on_hook],
  ] as const;
  const [name, value] = dims.reduce((lo, d) => (d[1] < lo[1] ? d : lo));
  return `lowest: ${name} ${value}`;
}

/**
 * The single reviewer-driven re-brief: each rejected symbol with the
 * reviewer's note and what it fell down on, the symbols already tried (never
 * to be reused), and a push to other domains, since a rejected set usually
 * shares one. Pure.
 */
export function reviewerRewriteInstruction(rejected: RejectedConcept[], tried: string[] = []): string {
  const lines = rejected.map((r) => `- ${r.symbol}: ${r.note || 'no note'} (${weakest(r.scores)})`);
  const all = [...new Set([...tried, ...rejected.map((r) => r.symbol)])];
  return [
    ...lines,
    `Do not reuse any of these symbols: ${all.join('; ')}.`,
    'Find symbols from different domains than these: if they were all tools of one trade, look to sport, home, nature, transport, building, kitchen or travel instead.',
  ].join('\n');
}

/**
 * Lex prompt for the alt text alone. Alt text never carries a disclaimer, so no
 * keys are offered: the only question is whether it editorialises.
 */
export function buildAltTextLexPrompt(altText: string): string {
  return `Classify this image alt text for financial-advice risk. You are advisory — you never block; your verdict is data the founder reviews.

Alt text should only describe what an image shows. It must not editorialise, imply returns, or recommend anything.

## The alt text
${altText}

## Classify (exactly one)
- educational — plainly describes the picture; no claim, no recommendation.
- general_advice — implies an outcome, a direction for a price, or an action a reader could take.
- personal_opinion — reads as a personal recommendation or a founder's individual take.

Alt text never carries a disclaimer: set needs_disclaimer = false and disclaimer_key = null.

## Rationale
Give a one-breath rationale naming the specific phrase that moved your verdict. Do not rewrite the alt text.`;
}
