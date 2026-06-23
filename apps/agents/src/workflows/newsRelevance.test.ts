import { describe, it, expect } from 'vitest';
import { defaultRelevanceFilter, NewsCategory } from '@platform/shared';
import { shouldDropForRelevance } from './newsRelevance.js';

// The relevance gate runs after the LLM judge has curated the shortlist, so it
// is a final guardrail rather than the primary relevance signal. Each filter
// mode decides which axes a story must satisfy to survive.
describe('shouldDropForRelevance', () => {
  const cases = [
    { au: false, btc: false },
    { au: true, btc: false },
    { au: false, btc: true },
    { au: true, btc: true },
  ];

  describe("au_or_bitcoin (default)", () => {
    it('drops only when both axes fail', () => {
      for (const c of cases) {
        const rel = { australian_relevance: c.au, bitcoin_relevance: c.btc };
        expect(shouldDropForRelevance('au_or_bitcoin', rel)).toBe(!c.au && !c.btc);
      }
    });
  });

  describe('bitcoin', () => {
    it('drops whenever bitcoin_relevance is false, regardless of AU', () => {
      for (const c of cases) {
        const rel = { australian_relevance: c.au, bitcoin_relevance: c.btc };
        expect(shouldDropForRelevance('bitcoin', rel)).toBe(!c.btc);
      }
    });
  });

  describe('none', () => {
    it('never drops — trusts the judge', () => {
      for (const c of cases) {
        const rel = { australian_relevance: c.au, bitcoin_relevance: c.btc };
        expect(shouldDropForRelevance('none', rel)).toBe(false);
      }
    });
  });
});

// The workflow falls back to this when a routine's action_config omits
// relevance_filter. Macro must default to 'none' so a global macro story
// (neither AU- nor Bitcoin-specific) isn't dropped by the au_or_bitcoin gate.
describe('defaultRelevanceFilter', () => {
  it("returns 'none' for macro so its global stories survive the gate", () => {
    expect(defaultRelevanceFilter(NewsCategory.MACRO)).toBe('none');
    const globalMacroStory = { australian_relevance: false, bitcoin_relevance: false };
    expect(shouldDropForRelevance(defaultRelevanceFilter(NewsCategory.MACRO), globalMacroStory)).toBe(false);
  });

  it("returns 'au_or_bitcoin' for every non-macro category", () => {
    for (const category of Object.values(NewsCategory)) {
      if (category === NewsCategory.MACRO) continue;
      expect(defaultRelevanceFilter(category)).toBe('au_or_bitcoin');
    }
  });
});
