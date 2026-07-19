// Streak / persistence: a value has held within a band for N consecutive
// periods. The honest reading of "anchored at 27": the persistence IS the
// finding, so materiality rises with it (opposite of the anomaly guard). Pure.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { ObservationBundle } from '../dataAccess.js';
import { baselineOf, resampleToMonthly, trailingRunLength } from '../stats.js';
import { clamp01, evidenceRefs, findingId, isFresh, resolutionFor, UNSCORED, vocabFor } from './shared.js';

// Series where a level-hold is a story: sentiment pinned in a band, momentum
// parked, valuation ratios flat, volatility compressed, policy rates on hold.
const STREAK_KEYS = [
  'fear_greed',
  'rsi_14',
  'mvrv',
  'mayer_multiple',
  'realized_vol_30d',
  'macro:rba_cash_rate',
  'macro:fed_funds',
] as const;

const MIN_STREAK_DAILY = 7;
const MIN_STREAK_PERIODIC = 3;

export function computeStreaks(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const key of STREAK_KEYS) {
    const series = bundle.series[key];
    if (!series) continue;

    const resolution = resolutionFor(series);
    // NOT collapseToPeriods: identical monthly values are exactly the streak
    // (a policy rate held for six meetings), so reprint-dedup must not apply.
    const points =
      resolution.period === 'day' ? series.points : resampleToMonthly(series.points);
    const window = points.slice(-resolution.windowPeriods);
    const minStreak = resolution.period === 'day' ? MIN_STREAK_DAILY : MIN_STREAK_PERIODIC;
    if (window.length < minStreak * 2) continue;

    const latest = window[window.length - 1];
    if (!isFresh(latest.date, bundle.asOf, resolution.period === 'day' ? 2 : 45)) continue;

    const values = window.map((p) => p.value);
    const baseline = baselineOf(values);
    // Band centred on where the value currently sits — "anchored at 27" holds
    // near the bottom of Fear & Greed's range, so the band cannot be a
    // percentile slice of the window. Width = ±10% of the window's p05–p95
    // range (a genuinely flat window means any wobble breaks the hold).
    const fullRange = baseline.p95 - baseline.p05;
    const halfBand = fullRange * 0.1;
    const bandLo = latest.value - halfBand;
    const bandHi = latest.value + halfBand;
    const streak = trailingRunLength(window, (p) => p.value >= bandLo && p.value <= bandHi);
    if (streak < minStreak) continue;

    const streakValues = window.slice(-streak).map((p) => p.value);
    const streakSpread = Math.max(...streakValues) - Math.min(...streakValues);
    const periodWord = resolution.period === 'day' ? 'day' : resolution.period;

    findings.push({
      id: findingId('streak', series.key, bundle.asOf),
      finding_type: 'streak',
      metric_key: series.key,
      metric_group: series.group,
      period: resolution.period,
      as_of: latest.date,
      window_days: resolution.windowDays,
      // Periods held — the persistence is the finding.
      observed: streak,
      baseline,
      // Twice the minimum hold = fully unusual for this type.
      unusualness: clamp01(streak / (2 * minStreak)),
      // How tightly the streak is pinned inside its band: dead-flat = 1.
      magnitude_norm: halfBand > 0 ? clamp01(1 - streakSpread / (2 * halfBand)) : 1,
      persistence_periods: streak,
      direction: 'flat_break',
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: vocabFor(config, series.group),
      narration_hint: {
        means:
          `${series.label} has held between ${bandLo.toFixed(1)} and ${bandHi.toFixed(1)} ` +
          `for ${streak} consecutive ${periodWord}s`,
        noise_note: 'the persistence is the story, not the level',
        verdict_allowed: true, // persistence is by definition multi-period
      },
      evidence_refs: evidenceRefs(series, [latest.date]),
    });
  }

  return findings;
}
