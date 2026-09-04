/**
 * The numeric validator.
 *
 * Every figure an extraction claims has to be re-located in the source text
 * before it can commit. This is the step that separates the pipeline from a
 * summariser: a model that reads "A$1,000,000 for 6.08914 bitcoin" and emits
 * 6.089 has produced a plausible sentence and a wrong ledger, and no amount of
 * prompt engineering makes that failure mode go away. Checking it afterwards,
 * arithmetically, does.
 *
 * Deliberately not a second model call. A validator that can hallucinate is not
 * a validator, and the whole value of this step is that its verdict is
 * reproducible — the same document and the same claim give the same answer
 * every time, which is what makes a rejection worth acting on.
 *
 * The three research records are the calibration. Secondary sources reported a
 * first purchase at roughly A$647,500 and roughly US$667,000 against A$1,000,000
 * in the announcement; a validator that accepted a nearby number would have let
 * either through.
 */

/**
 * How close a claimed figure must be to a figure in the text.
 *
 * Relative, not absolute, because the register spans five orders of magnitude —
 * a tolerance that suits A$1.0m would swallow the difference between 6.08914
 * and 6.089 bitcoin. Tight enough that it only absorbs floating-point
 * representation, never a rounding the extractor did.
 */
const RELATIVE_EPSILON = 1e-9;

/** Magnitude words and suffixes an issuer actually writes. */
const MAGNITUDES: ReadonlyArray<[RegExp, number]> = [
  [/^(?:bn|b|billion)$/i, 1e9],
  [/^(?:m|mn|million)$/i, 1e6],
  [/^(?:k|thousand)$/i, 1e3],
];

// A number as it appears in a filing: optional thousands separators (comma or
// thin space), optional decimals, optional magnitude suffix. The currency
// prefix is not captured — "A$1.0m" and "1.0m" carry the same value, and which
// currency it is belongs to the claim, not to the token.
const NUMBER_TOKEN = /(\d{1,3}(?:[,   ]\d{3})+|\d+)(?:\.(\d+))?\s*(bn|b|billion|mn|m|million|k|thousand)?\b/gi;

/**
 * Every numeric value the text states, in the units it states them.
 *
 * "A$1.0m" yields 1000000 because that is the value on the page — an extractor
 * writing 1000000 has read it correctly, not invented it. What the validator
 * refuses is a value that appears nowhere under any rendering.
 */
export function extractNumericTokens(text: string): number[] {
  const values: number[] = [];

  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const [, whole, decimals, suffix] = match;
    const digits = whole.replace(/[,   ]/g, '');
    const base = Number(decimals ? `${digits}.${decimals}` : digits);
    if (!Number.isFinite(base)) continue;

    values.push(base);

    if (suffix) {
      const magnitude = MAGNITUDES.find(([pattern]) => pattern.test(suffix));
      if (magnitude) values.push(base * magnitude[1]);
    }
  }

  return values;
}

function matches(claimed: number, found: number): boolean {
  if (claimed === found) return true;
  const scale = Math.max(Math.abs(claimed), Math.abs(found), 1);
  return Math.abs(claimed - found) <= scale * RELATIVE_EPSILON;
}

/** One numeric assertion made by an extraction, named by the field it came from. */
export interface NumericClaim {
  field: string;
  value: number;
}

export interface RejectedClaim extends NumericClaim {
  /** The nearest value the document does state, when there is one. Diagnostic only. */
  nearest: number | null;
}

export interface ValidationVerdict {
  ok: boolean;
  rejected: RejectedClaim[];
}

/**
 * Checks every claim against the source text.
 *
 * A claim of zero is checked like any other: "no capital drawn during the
 * quarter" is a disclosed figure, and an extractor that invents it is making
 * the same class of error as one that invents a purchase.
 */
export function validateClaims(claims: readonly NumericClaim[], sourceText: string): ValidationVerdict {
  if (claims.length === 0) return { ok: true, rejected: [] };

  const found = extractNumericTokens(sourceText);
  const rejected: RejectedClaim[] = [];

  for (const claim of claims) {
    if (found.some((value) => matches(claim.value, value))) continue;

    // The nearest stated figure makes a rejection legible: "claimed 6.089, the
    // document says 6.08914" is a report someone can act on, where "not found"
    // is a shrug.
    const nearest = found.length
      ? found.reduce((best, value) =>
          Math.abs(value - claim.value) < Math.abs(best - claim.value) ? value : best,
        )
      : null;

    rejected.push({ ...claim, nearest });
  }

  return { ok: rejected.length === 0, rejected };
}

/** The numeric fields of a candidate event, as claims. Null fields assert nothing. */
export function claimsForEvent(event: {
  quantity?: number | null;
  consideration_native?: number | null;
}): NumericClaim[] {
  const claims: NumericClaim[] = [];
  if (typeof event.quantity === 'number') claims.push({ field: 'quantity', value: event.quantity });
  if (typeof event.consideration_native === 'number') {
    claims.push({ field: 'consideration_native', value: event.consideration_native });
  }
  return claims;
}
