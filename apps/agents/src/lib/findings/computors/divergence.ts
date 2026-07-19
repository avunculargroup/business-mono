// Divergence: a trailing correlation on a DECLARED pair breaks — flips sign or
// falls below the band it normally holds. Pairs are curated in
// finding_divergence_pairs, never all-pairs. The finding is the BREAK, not
// either series moving. Pure.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { ObservationBundle } from '../dataAccess.js';
import { baselineOf, resampleToMonthly, rollingCorrelation, trailingRunLength, unusualnessOf } from '../stats.js';
import { clamp01, findingId, isFresh, UNSCORED, vocabFor } from './shared.js';

// Trailing correlation points needed beyond the window before "the band it
// normally holds" is a real claim.
const MIN_BASELINE_CORRS = 12;

export function computeDivergences(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const pair of config.divergencePairs) {
    const primary = bundle.series[pair.primary_key];
    const secondary = bundle.series[pair.secondary_key];
    if (!primary || !secondary) continue;

    // Resample both legs to the coarser granularity so a daily × monthly pair
    // correlates print-to-print, not print-to-noise.
    const monthly = primary.granularity !== 'daily' || secondary.granularity !== 'daily';
    const a = monthly ? resampleToMonthly(primary.points) : primary.points;
    const b = monthly ? resampleToMonthly(secondary.points) : secondary.points;
    const windowPeriods = monthly
      ? Math.max(6, Math.round(pair.corr_window_days / 30))
      : pair.corr_window_days;

    const corrs = rollingCorrelation(a, b, windowPeriods);
    if (corrs.length < MIN_BASELINE_CORRS + 1) continue;

    const latest = corrs[corrs.length - 1];
    if (!isFresh(latest.date, bundle.asOf, monthly ? 45 : 2)) continue;

    // Signed so that "holding" is positive regardless of the expected sign:
    // +1.0 = the expected relationship at full strength, negative = flipped.
    const orient = pair.expected_sign === 'positive' ? 1 : -1;
    const held = corrs.map((c) => c.corr * orient);
    const current = latest.corr * orient;

    const broken = current < pair.break_threshold;
    if (!broken) continue;

    // The break is only news if the relationship normally holds: the trailing
    // median must sit above the threshold the pair is expected to keep.
    const baselineHeld = held.slice(0, -1);
    const baseline = baselineOf(baselineHeld);
    if (baseline.p50 < pair.break_threshold) continue;

    const unusualness = unusualnessOf(baselineHeld, current);
    const persistence = trailingRunLength(held, (h) => h < pair.break_threshold);

    findings.push({
      id: findingId('divergence', pair.primary_key, bundle.asOf, pair.secondary_key),
      finding_type: 'divergence',
      metric_key: pair.primary_key,
      metric_group: primary.group,
      secondary_metric_key: pair.secondary_key,
      period: monthly ? 'month' : 'day',
      as_of: latest.date,
      window_days: pair.corr_window_days,
      // The raw trailing correlation — what the narrator may cite.
      observed: latest.corr,
      baseline,
      unusualness,
      // Correlations live in [-1, 1]: a full-point slide off the usual band = 1.
      magnitude_norm: clamp01(Math.abs(current - baseline.p50)),
      persistence_periods: persistence,
      direction: 'flat_break',
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: [...vocabFor(config, primary.group), ...vocabFor(config, secondary.group)],
      narration_hint: {
        means:
          `${primary.label} and ${secondary.label} have decoupled: trailing correlation ` +
          `${latest.corr.toFixed(2)} against a usual ${(baseline.p50 * orient).toFixed(2)}`,
        noise_note: persistence > 1 ? `the break has held for ${persistence} periods` : 'first period outside the usual band',
        verdict_allowed: persistence > 1,
      },
      evidence_refs: [
        `view:rolling_correlation`,
        `key:${pair.primary_key}`,
        `key:${pair.secondary_key}`,
        `date:${latest.date}`,
      ],
    });
  }

  return findings;
}
