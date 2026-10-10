import { createScorer } from '@mastra/core/evals';
import { abstractOverlap, summaryStrings } from '@platform/shared';

/**
 * How much of a paper summary repeats the abstract it was written from, as the
 * share of its unquoted words that sit inside a run of six or more words
 * copied from the abstract. **Lower is better**: 0 is a summary entirely in
 * its own words, and anything above 0 is a summary the paper linter would
 * block.
 *
 * Run over the library papers golden set once Charlie's summary step exists
 * (Session 3). The dataset item's `groundTruth.abstract` is the abstract, and
 * `output` is the summary, either the structured object or its plain render.
 */
export const abstractOverlapScorer = createScorer({
  id: 'abstract-overlap',
  description: 'Share of a paper summary copied from its abstract in runs of six or more words (lower is better)',
}).generateScore(({ run }) => {
  const abstract = (run.groundTruth as { abstract?: string } | undefined)?.abstract;
  if (!abstract) return 0;
  return abstractOverlap(summaryStrings(run.output), abstract).overlap;
});
