import { z } from 'zod';
import { readStoredBrief, type ImageBrief as SharedImageBrief, type Layout } from '@platform/shared';
import type { StoryCandidate } from './select.js';

// The image brief: the only part of an image an LLM decides. It reads the post
// for its tension, then proposes up to three concepts, each a familiar symbol
// everyone already knows with one visible twist that makes it about this post,
// and a layout. It never writes the prompt the image model receives
// (buildImagePrompt does).
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

const conceptSchema = z.object({
  tension: z.string().max(200),
  symbol: z.string().max(200), // a familiar, instantly recognisable object
  twist: z.string().max(200), // the one visible change that ties it to the post
  subject: z.string().max(200), // the symbol with its twist, as it will be drawn
  layout: z.string(), // validated against active layouts by the linter
  alt_text: z.string().max(300),
});

export const imageBriefSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  concepts: z.array(conceptSchema).max(3),
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
  concepts: [],
};

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

  return `Propose an image to sit beside a founder's social post. You are not writing an image prompt: the house style (a bold two-colour linocut), palette and prohibitions are fixed elsewhere. Your job is to find the idea worth printing.

## The post${form}
${p.postCopy}

${story}## The half-second test
The image is seen at phone size by someone scrolling past. In half a second they must recognise the subject and get the idea, without reading the post. A clever image that needs a caption fails.

## Work it out in this order, for each concept
1. tension: the surprising or uneasy idea in this post, in one sentence. Not its topic.
2. symbol: an object, place or tool everyone already knows. Instant recognition matters more than originality.
3. twist: one change to the symbol that ties it to the tension. One change only. It must be visible in the picture, not explained in words.
4. subject: one sentence describing the symbol with its twist, as it will be printed. One big subject.
5. layout: exactly one key from this list:
${layoutList}
6. alt_text: what the image shows, for a screen reader, plainly, under 300 characters. Describe the picture, not the post's argument.

Then test each concept: would someone scrolling past at phone size recognise the symbol and get the twist without reading the post? If not, pick a simpler symbol.

## Examples
- Weak, a symbol with no twist: "Twenty years" became an hourglass. True, but it says nothing.
- Weak, no symbol: a half-drawn bridge pier for a regulator's consultation paper. It needs explaining.
- Strong: a regulator's consultation paper became a giant rubber stamp poised just above a blank sheet, about to land. Or a lighthouse throwing one solid gold beam through fog, for "clarity's coming".

## Rules
- Return three concepts with three different symbols, using at least two different layouts.
- No text, letters, numbers or figures anywhere in the picture. Images cannot carry them.
- No coins, currency symbols, charts, arrows or anything that implies a price going up or down. No people's faces.${avoid}
- Keep the bottom-right corner of the picture empty.
- If the post has no honest visual, set skip = true with a short skip_reason and return no concepts. Skipping is a good outcome, not a failure.${history}${rewrite}`;
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
