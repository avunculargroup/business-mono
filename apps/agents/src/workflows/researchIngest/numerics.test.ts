import { describe, it, expect } from 'vitest';
import { claimsForEvent, extractNumericTokens, validateClaims } from './numerics.js';

// The announcement line the first-acquisition row is read from, and the two
// secondary figures that got it wrong.
const ANNOUNCEMENT =
  'The Company has acquired 6.08914 bitcoin for A$1,000,000, representing an average ' +
  'price of A$164,227 per bitcoin inclusive of fees and expenses.';

describe('extractNumericTokens', () => {
  it('reads thousands separators as one number', () => {
    expect(extractNumericTokens('A$1,000,000')).toContain(1000000);
  });

  it('does not split a separated number into its groups', () => {
    // The failure this guards: 1,000,000 read as 1 then 000 then 000, which
    // makes the validator accept a claim of 1.
    expect(extractNumericTokens('A$1,000,000')).not.toContain(1);
  });

  it('keeps decimals to full precision', () => {
    expect(extractNumericTokens('6.08914 bitcoin')).toContain(6.08914);
  });

  it('expands a magnitude suffix to the value it stands for', () => {
    // "A$1.0m" and "A$1,000,000" are the same disclosure written two ways.
    expect(extractNumericTokens('A$1.0m raised')).toContain(1000000);
    expect(extractNumericTokens('US$696m')).toContain(696000000);
    expect(extractNumericTokens('A$1.35m aggregate')).toContain(1350000);
  });

  it('keeps the unsuffixed reading as well', () => {
    // "1.0m" states both 1.0 and 1,000,000 depending on what is being counted,
    // and the validator should be able to match either.
    const values = extractNumericTokens('1.0m');
    expect(values).toContain(1);
    expect(values).toContain(1000000);
  });

  it('reads a percentage as its stated number', () => {
    expect(extractNumericTokens('approximately 13% of market capitalisation')).toContain(13);
  });
});

describe('validateClaims', () => {
  it('accepts figures the announcement states', () => {
    const verdict = validateClaims(
      [
        { field: 'quantity', value: 6.08914 },
        { field: 'consideration_native', value: 1000000 },
      ],
      ANNOUNCEMENT,
    );

    expect(verdict.ok).toBe(true);
    expect(verdict.rejected).toEqual([]);
  });

  it('rejects a figure the extractor rounded', () => {
    // The demo's showpiece. 6.089 is a plausible sentence and a wrong ledger.
    const verdict = validateClaims([{ field: 'quantity', value: 6.089 }], ANNOUNCEMENT);

    expect(verdict.ok).toBe(false);
    expect(verdict.rejected[0].field).toBe('quantity');
  });

  it('names the nearest stated figure so a rejection can be acted on', () => {
    const verdict = validateClaims([{ field: 'quantity', value: 6.089 }], ANNOUNCEMENT);

    expect(verdict.rejected[0].nearest).toBe(6.08914);
  });

  it('rejects the two consideration figures the secondary sources reported', () => {
    // A$647,500 and US$667,000 against A$1,000,000 in the announcement. A
    // validator that accepted a nearby number would have let both through.
    for (const wrong of [647500, 667000]) {
      const verdict = validateClaims([{ field: 'consideration_native', value: wrong }], ANNOUNCEMENT);
      expect(verdict.ok).toBe(false);
    }
  });

  it('accepts a figure written with a magnitude suffix in the source', () => {
    const verdict = validateClaims(
      [{ field: 'consideration_native', value: 1450000 }],
      'a A$1.45m placement at A$0.07 per share',
    );

    expect(verdict.ok).toBe(true);
  });

  it('checks a claim of zero like any other', () => {
    // "No at-the-market capital was drawn" is a disclosed figure. An extractor
    // that invents it is making the same class of error as one that invents a
    // purchase.
    const stated = validateClaims([{ field: 'quantity', value: 0 }], 'nil capital drawn: 0 shares issued');
    const invented = validateClaims([{ field: 'quantity', value: 0 }], 'the facility remained available');

    expect(stated.ok).toBe(true);
    expect(invented.ok).toBe(false);
  });

  it('passes an event with no figures at all', () => {
    // A policy adoption or a covenant change asserts nothing numeric, and must
    // not be rejected for having nothing to check.
    expect(validateClaims([], ANNOUNCEMENT).ok).toBe(true);
  });

  it('rejects every claim when the document has no text', () => {
    // A document that failed extraction validates nothing. Passing here would
    // make an empty PDF the easiest way to get a figure committed.
    const verdict = validateClaims([{ field: 'quantity', value: 6.08914 }], '');

    expect(verdict.ok).toBe(false);
    expect(verdict.rejected[0].nearest).toBeNull();
  });
});

describe('claimsForEvent', () => {
  it('claims only the fields the event actually carries', () => {
    expect(claimsForEvent({ quantity: 6.08914, consideration_native: 1000000 })).toHaveLength(2);
    expect(claimsForEvent({ quantity: null, consideration_native: null })).toHaveLength(0);
  });

  it('claims a zero rather than treating it as absent', () => {
    expect(claimsForEvent({ quantity: 0 })).toEqual([{ field: 'quantity', value: 0 }]);
  });
});
