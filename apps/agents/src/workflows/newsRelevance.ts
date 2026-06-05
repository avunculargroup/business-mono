import type { NewsRelevanceFilter } from '@platform/shared';

// Decide whether a curated news story should be dropped on relevance grounds,
// per the routine's configured filter. The LLM judge has already ranked the
// shortlist for topical fit, so this is a final guardrail — 'none' trusts the
// judge and keeps everything (used by the macro feed, which needn't be
// Australian or Bitcoin specific).
export function shouldDropForRelevance(
  filter: NewsRelevanceFilter,
  rel: { bitcoin_relevance: boolean; australian_relevance: boolean },
): boolean {
  switch (filter) {
    case 'none': return false;
    case 'bitcoin': return rel.bitcoin_relevance === false;
    case 'au_or_bitcoin':
    default:
      return rel.bitcoin_relevance === false && rel.australian_relevance === false;
  }
}
