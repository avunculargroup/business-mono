// Anomaly: magnitude of the period-change vs its own trailing distribution.
// This is what turns "−8%" into "−8%, outside the trailing 90-day band" — the
// percentile is the load-bearing claim, and only this computor can supply it
// honestly. Pure.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { ObservationBundle } from '../dataAccess.js';
import { baselineOf, periodDeltas, sd, trailingRunLength, unusualnessOf } from '../stats.js';
import {
  clamp01,
  evidenceRefs,
  findingId,
  isFresh,
  resolutionFor,
  UNSCORED,
  verdictAllowed,
  vocabFor,
  volClassFor,
} from './shared.js';

// Monotonic or state-like series where a period-delta distribution is
// meaningless (block_height/supply only go up; ma_cross is a spread handled by
// inflection/threshold; realised_cap is near-monotonic by construction).
const EXCLUDED_KEYS = new Set(['block_height', 'supply', 'ma_cross', 'realised_cap']);

// Baseline deltas required before a percentile claim is honest.
const MIN_DELTAS_DAILY = 30;
const MIN_DELTAS_PERIODIC = 12;

// The triggering delta must be recent, else the feed is stale (staleness
// computor's job) and an "overnight move" claim would be false.
const FRESHNESS_DAYS: Record<string, number> = { day: 2, month: 45, quarter: 130 };

export function computeAnomalies(bundle: ObservationBundle, config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const series of Object.values(bundle.series)) {
    if (EXCLUDED_KEYS.has(series.key)) continue;

    const resolution = resolutionFor(series);
    const deltas = periodDeltas(series.points, resolution).slice(-(resolution.windowPeriods + 1));
    const minDeltas = resolution.period === 'day' ? MIN_DELTAS_DAILY : MIN_DELTAS_PERIODIC;
    if (deltas.length < minDeltas + 1) continue;

    const latest = deltas[deltas.length - 1];
    if (!isFresh(latest.date, bundle.asOf, FRESHNESS_DAYS[resolution.period])) continue;

    const baselinePcts = deltas.slice(0, -1).map((d) => d.pct);
    const unusualness = unusualnessOf(baselinePcts, latest.pct);
    if (unusualness < config.tunables.anomalyFloor) continue;

    const baseline = baselineOf(baselinePcts);
    const spread = sd(baselinePcts);
    // 3σ move = 1.0. A zero-variance baseline makes any move maximal.
    const magnitudeNorm = spread > 0 ? clamp01(Math.abs(latest.pct) / (3 * spread)) : latest.pct !== 0 ? 1 : 0;

    const sign = Math.sign(latest.abs);
    const persistence = trailingRunLength(deltas, (d) => Math.sign(d.abs) === sign && sign !== 0);
    const volClass = volClassFor(config, series.group);
    const canVerdict = verdictAllowed(persistence, volClass);
    const direction = latest.abs > 0 ? 'up' : 'down';
    const periodWord = resolution.period === 'day' ? 'day' : resolution.period;

    findings.push({
      id: findingId('anomaly', series.key, bundle.asOf),
      finding_type: 'anomaly',
      metric_key: series.key,
      metric_group: series.group,
      period: resolution.period,
      as_of: latest.date,
      window_days: resolution.windowDays,
      observed: latest.pct,
      baseline,
      unusualness,
      magnitude_norm: magnitudeNorm,
      persistence_periods: persistence,
      direction,
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: vocabFor(config, series.group),
      narration_hint: {
        means: `${series.label} ${direction === 'up' ? 'rose' : 'fell'} ${Math.abs(latest.pct).toFixed(1)}% over the ${periodWord}`,
        noise_note: 'outside its normal band for the trailing window',
        verdict_allowed: canVerdict,
      },
      evidence_refs: evidenceRefs(series, [latest.date]),
    });
  }

  return findings;
}
