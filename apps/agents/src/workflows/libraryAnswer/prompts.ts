// Prompts + pure helpers for the "Ask the library" RAG answer. Kept separate
// from index.ts so they're unit-testable.

import type { TranscriptVectorSearchResult } from '@platform/db';
import type { LibraryCitation } from '@platform/shared';

// A citation quote is a snippet, not a whole ~2.3k-char segment. Cap what we
// store (and what we show the model) so the answer stays readable.
export const MAX_QUOTE_CHARS = 280;

/** mm:ss (or h:mm:ss) for a second count — for the sources block the model reads. */
export function formatStamp(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const base = `${mm}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${base}` : base;
}

/** Trim a segment to a citation-length snippet. Pure. */
export function truncateQuote(text: string, max = MAX_QUOTE_CHARS): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/** Number the retrieved segments as sources the model can cite by index. */
export function buildSourcesBlock(results: TranscriptVectorSearchResult[]): string {
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.episode_title} @ ${formatStamp(r.start_seconds)}\n"${truncateQuote(r.content)}"`,
    )
    .join('\n\n');
}

/**
 * Resolve the model's cited source numbers (1-based) back to real citations from
 * the retrieved segments. Deduped, order preserved, out-of-range dropped — so a
 * citation always deep-links to a segment that was actually retrieved. Pure.
 */
export function resolveCitations(
  citedSources: number[],
  results: TranscriptVectorSearchResult[],
): LibraryCitation[] {
  const seen = new Set<number>();
  const citations: LibraryCitation[] = [];
  for (const n of citedSources) {
    if (seen.has(n)) continue;
    seen.add(n);
    const r = results[n - 1];
    if (!r) continue;
    citations.push({
      episode_id: r.episode_id,
      episode_title: r.episode_title,
      start_seconds: r.start_seconds,
      quote: truncateQuote(r.content),
    });
  }
  return citations;
}

/** Rex's RAG answer: grounded in the sources, cited by number, descriptive. */
export function buildAnswerPrompt(question: string, sourcesBlock: string): string {
  return `A director asked a question of the BTS podcast library. Answer it using ONLY the numbered transcript excerpts below.

## What to produce
- **answer** — 2–4 sentences answering the question directly, in plain CFO-audience prose. Synthesise across the excerpts; don't just quote one. If the excerpts don't actually address the question, say so plainly rather than inventing an answer.
- **cited_sources** — the numbers of the excerpts your answer draws on (e.g. [1, 3]). Cite every excerpt you used; don't cite ones you didn't. If you could not answer from the excerpts, return an empty list.

## Rules
- **Ground everything in the excerpts.** Do not add facts, figures, or claims that aren't in them. No outside knowledge.
- **Describe, never advise.** These are third parties' podcasts. Report what speakers said — "on [1] the guest argued…", "several discussions ([2], [4]) noted…". Never state BTS's own view, never frame anything as a reason to buy, sell, accumulate, or time the market, and never make a price prediction.
- **Brand voice.** "Bitcoin" (capital B) = the network/protocol; "bitcoin" (lowercase b) = the currency/unit. Never "crypto", "cryptocurrency", or "digital assets". No hype, no exclamation marks.

## QUESTION
${question}

## SOURCES
${sourcesBlock}`;
}

/** Lex's review of a synthesised answer. Lex's system prompt carries the AFSL/AR
 *  persona; this supplies the material. */
export function buildAnswerLexPrompt(question: string, answer: string): string {
  return `Review this answer for advice risk under AFSL/AR.

The answer synthesises what THIRD-PARTY podcast guests said, in response to a director's question. It must read as neutral description of what speakers said, never as BTS recommending action or predicting price. Flag any phrase that reads as a buy/sell/accumulate/time-the-market signal, a price prediction, or a "cheap/expensive/undervalued/overvalued" framing presented as BTS's own view rather than as reported speech.

QUESTION: ${question}

ANSWER:
${answer}`;
}
