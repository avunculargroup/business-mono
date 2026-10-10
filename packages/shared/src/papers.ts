// ============================================================
// Library papers — keeping a summary apart from the abstract it was written from
// ============================================================
// An abstract-only summary of a paywalled paper is ours to display; the
// publisher's abstract often is not. A summary that lifts the abstract's
// sentences is the abstract under another name, so the paper linter blocks any
// run of ABSTRACT_OVERLAP_RUN or more consecutive words shared with the
// abstract, outside quotation marks. Quoting is how a summary cites the authors
// and is allowed. The same measure, as a ratio, is the golden-set scorer in
// apps/agents/evals/scorers/abstractOverlap.ts.
// Policy: docs/features/client-app/library-papers-spec.md#abstract-policy-for-paywalled-papers

export const ABSTRACT_OVERLAP_RUN = 6;

export interface AbstractOverlap {
  /** Each maximal run of copied words, lowercased and space-joined. Any entry fails the linter. */
  copiedRuns: string[];
  /** Share of the summary's unquoted words that sit inside a copied run, 0–1. */
  overlap: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
// Straight and curly double quotes. Single quotes are left alone: they are
// apostrophes far more often than quotation marks.
const QUOTED = /"[^"]*"|“[^”]*”/g;

function words(text: string): string[] {
  return (text.match(WORD) ?? []).map((w) => w.toLowerCase().replace(/’/g, "'"));
}

/**
 * Compares a summary with the abstract it was written from. Quoted spans are
 * cut out, and the text either side of one is treated as separate, so a run
 * cannot be assembled across a quotation. A structured summary is passed as
 * its strings (see summaryStrings), so a run cannot span two fields either.
 */
export function abstractOverlap(
  summary: string | readonly string[],
  abstract: string,
  run: number = ABSTRACT_OVERLAP_RUN,
): AbstractOverlap {
  const source = words(abstract);
  const grams = new Set<string>();
  for (let i = 0; i + run <= source.length; i++) grams.add(source.slice(i, i + run).join(' '));

  const copiedRuns: string[] = [];
  let total = 0;
  let copied = 0;

  const segments = (typeof summary === 'string' ? [summary] : summary).flatMap((s) => s.split(QUOTED));
  for (const segment of segments) {
    const w = words(segment);
    total += w.length;
    const covered = new Array<boolean>(w.length).fill(false);
    for (let i = 0; i + run <= w.length; i++) {
      if (grams.has(w.slice(i, i + run).join(' '))) covered.fill(true, i, i + run);
    }
    for (let i = 0; i < w.length; ) {
      if (!covered[i]) { i++; continue; }
      let j = i;
      while (j < w.length && covered[j]) j++;
      copiedRuns.push(w.slice(i, j).join(' '));
      copied += j - i;
      i = j;
    }
  }

  return { copiedRuns, overlap: total === 0 ? 0 : copied / total };
}

/** Every string in a structured summary ({question, data, method, findings[], …}), in order. */
export function summaryStrings(summary: unknown): string[] {
  if (typeof summary === 'string') return [summary];
  if (Array.isArray(summary)) return summary.flatMap(summaryStrings);
  if (summary && typeof summary === 'object') return Object.values(summary).flatMap(summaryStrings);
  return [];
}
