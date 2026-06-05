import { describe, it, expect } from 'vitest';
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
