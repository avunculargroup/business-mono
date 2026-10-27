import { createScorer } from '@mastra/core/evals';
import type { KeyPoint } from '@platform/shared';

/**
 * Scorers for the news-background eval: a fact an article restates as context
 * must be extracted as `background`, and must not reach the digest intro.
 *
 * Both read `groundTruth.factPattern`, a regex source matching the fact (e.g.
 * `4\.60?\s?%` for the September cash rate). A regex rather than a sentence,
 * because the extractor paraphrases.
 */

function factRegex(groundTruth: unknown): RegExp | null {
  const source = (groundTruth as { factPattern?: string } | undefined)?.factPattern;
  return source ? new RegExp(source, 'i') : null;
}

/**
 * 1 when at least one extracted point states the fact and every point that
 * states it is `background`; 0 otherwise — including when the fact was not
 * extracted at all, since the fixture exists to test its classification.
 */
export const backgroundClassifiedScorer = createScorer({
  id: 'background-classified',
  description: 'Is the restated fact extracted, and only ever as kind "background"?',
}).generateScore(({ run }) => {
  const re = factRegex(run.groundTruth);
  const points = (run.output as KeyPoint[] | undefined) ?? [];
  if (!re) return 0;
  const matching = points.filter((p) => re.test(p.text));
  return matching.length > 0 && matching.every((p) => p.kind === 'background') ? 1 : 0;
});

/** 1 when the intro does not state the fact; 0 when it does. */
export const introOmitsFactScorer = createScorer({
  id: 'intro-omits-fact',
  description: 'Does the digest intro leave the background fact out?',
}).generateScore(({ run }) => {
  const re = factRegex(run.groundTruth);
  const intro = typeof run.output === 'string' ? run.output : '';
  if (!re || !intro.trim()) return 0;
  return re.test(intro) ? 0 : 1;
});
