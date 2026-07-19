// Staleness (ops only — never narrated in the client report): a metric has not
// updated within its cadence tolerance. Distinguishes a QUIET day from a BROKEN
// FEED day: a silent findings engine must be silent because nothing was
// material, never because a provider didn't land. Pure.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { MetricSeries, ObservationBundle } from '../dataAccess.js';
import { findingId, UNSCORED } from './shared.js';

const EMPTY_BASELINE = { mean: 0, sd: 0, p05: 0, p50: 0, p95: 0 };

function toleranceDays(series: MetricSeries): number {
  if (series.granularity === 'quarterly') return 120;
  if (series.granularity === 'monthly') return 45;
  // Daily macro series (FRED) skip weekends and holidays.
  return series.key.startsWith('macro:') ? 5 : 2;
}

function ageDays(asOf: string, latest: string): number {
  return Math.round(
    (new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${latest}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

export function computeStaleness(bundle: ObservationBundle, _config: FindingConfig): Finding[] {
  const findings: Finding[] = [];

  for (const series of Object.values(bundle.series)) {
    const tolerance = toleranceDays(series);
    // A series with no stored points at all is the ultimate stale feed.
    const age = series.latestObservedAt ? ageDays(bundle.asOf, series.latestObservedAt) : Infinity;
    if (age <= tolerance) continue;

    const observed = Number.isFinite(age) ? age : -1; // -1 = never observed
    findings.push({
      id: findingId('staleness', series.key, bundle.asOf),
      finding_type: 'staleness',
      metric_key: series.key,
      metric_group: series.group,
      period: series.granularity === 'daily' ? 'day' : series.granularity === 'monthly' ? 'month' : 'quarter',
      as_of: series.latestObservedAt ?? bundle.asOf,
      window_days: tolerance,
      observed,
      baseline: EMPTY_BASELINE,
      unusualness: 0,
      magnitude_norm: 0,
      persistence_periods: 0,
      direction: 'flat_break',
      materiality: UNSCORED,
      compliance_class: 'informational',
      allowed_vocab: [],
      narration_hint: {
        means:
          observed === -1
            ? `${series.label} has no stored observations`
            : `${series.label} has not updated in ${observed} days (tolerance ${tolerance})`,
        verdict_allowed: false,
      },
      evidence_refs: [`key:${series.key}`, `date:${series.latestObservedAt ?? 'never'}`],
    });
  }

  return findings;
}
