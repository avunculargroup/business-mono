/**
 * Deterministic cash-rate check on the news-digest intro.
 *
 * newsVerifier checks the intro against the stories, which is only as good as
 * the stories: an article can be wrong, or stale, about the rate. This check
 * instead compares any RBA cash rate figure the intro states with the value
 * the indicator poll stored (RBA Cash Rate Target, F1 daily series, polled
 * daily — see lib/indicators/adapters/rba.ts).
 *
 * It catches a wrong figure, not a stale framing: "raised to 4.60%" passes while
 * 4.60% is still the rate. The per-point `kind` in news extraction is what stops
 * a restated old decision; this is the second line for the number itself.
 *
 * Known gap: on a decision day the stories can report the new rate before the
 * next poll stores it, so a correct new figure reads as a mismatch until then.
 */

import { supabase } from '@platform/db';

// "cash rate … 4.60%" / "cash rate of 4.6 per cent" — the figure within a short
// clause after the phrase, not any percentage elsewhere in the sentence.
const AFTER = /cash[- ]rate\b[^.%\d]{0,40}?(\d{1,2}(?:\.\d{1,2})?)\s?(?:%|per ?cent)/gi;
// "a 4.60% cash rate" / "4.35 per cent RBA cash rate".
const BEFORE = /(\d{1,2}(?:\.\d{1,2})?)\s?(?:%|per ?cent)\s+(?:(?:RBA|official|the)\s+)?cash[- ]rate\b/gi;

/** Every cash rate figure the text states, in order of appearance, deduped. */
export function extractCashRateFigures(text: string): number[] {
  const hits: Array<{ at: number; value: number }> = [];
  for (const re of [AFTER, BEFORE]) {
    for (const m of text.matchAll(re)) hits.push({ at: m.index ?? 0, value: Number(m[1]) });
  }
  hits.sort((a, b) => a.at - b.at);
  return [...new Set(hits.map((h) => h.value))];
}

export type CashRateCheck =
  | { status: 'ok' | 'no_figure' | 'no_stored_value' }
  | { status: 'mismatch'; stated: number[]; stored: number };

/** Pure: compares the intro's cash rate figures to the stored rate (to the basis point). */
export function checkIntroCashRate(intro: string, stored: number | null): CashRateCheck {
  const stated = extractCashRateFigures(intro);
  if (stated.length === 0) return { status: 'no_figure' };
  if (stored === null) return { status: 'no_stored_value' };
  const wrong = stated.filter((v) => Math.abs(v - stored) >= 0.005);
  return wrong.length ? { status: 'mismatch', stated: wrong, stored } : { status: 'ok' };
}

/**
 * The latest stored RBA cash rate, or null when the series is missing. Looked
 * up by region + category rather than by name or code, so a relabel in
 * /settings does not silently disable the check.
 */
export async function loadStoredCashRate(): Promise<number | null> {
  const { data, error } = await supabase
    .from('v_indicator_latest')
    .select('current_value')
    .eq('region', 'au')
    .eq('category', 'policy_rate')
    .limit(1)
    .maybeSingle();
  if (error || data?.current_value == null) return null;
  return Number(data.current_value);
}
