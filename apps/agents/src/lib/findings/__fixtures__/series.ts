// Synthetic series generators for the computor tests. All deterministic — a
// seeded LCG stands in for randomness so fixtures never flake.

import type { FindingConfig, GroupConfig } from '../config.js';
import { DEFAULT_TUNABLES } from '../config.js';
import type { HashRibbonPoint, MetricSeries, ObservationBundle } from '../dataAccess.js';
import type { SeriesPoint } from '../stats.js';

/** ISO date `n` days before asOf. */
export function daysBefore(asOf: string, n: number): string {
  return new Date(new Date(`${asOf}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Deterministic pseudo-random sequence in [-1, 1). */
export function noise(seed: number, length: number): number[] {
  const out: number[] = [];
  let state = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out.push((state / 2 ** 31) - 1);
  }
  return out;
}

/** Daily points, one per day, ending at asOf. */
export function dailyPoints(values: number[], asOf: string): SeriesPoint[] {
  return values.map((value, i) => ({ date: daysBefore(asOf, values.length - 1 - i), value }));
}

/** Monthly points (first-of-month), ending in the month of asOf. */
export function monthlyPoints(values: number[], asOf: string): SeriesPoint[] {
  const end = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  return values.map((value, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (values.length - 1 - i), 1));
    return { date: d.toISOString().slice(0, 10), value };
  });
}

/** A flat-ish daily series with mild noise and a final-day percentage spike.
 *  The day before the spike ticks the OTHER way so the spike is a genuine
 *  single-period move (persistence 1). */
export function spikedSeries(_asOf: string, days: number, base: number, spikePct: number, seed = 7): number[] {
  const jitter = noise(seed, days - 1);
  const values = jitter.map((j) => base * (1 + j * 0.005)); // ±0.5% daily noise
  const prior = values[values.length - 2];
  values[values.length - 1] = prior * (1 - Math.sign(spikePct) * 0.001);
  values.push(values[values.length - 1] * (1 + spikePct / 100));
  return values;
}

export function makeSeries(
  key: string,
  group: string,
  granularity: MetricSeries['granularity'],
  points: SeriesPoint[],
  label = key,
): MetricSeries {
  return {
    key,
    group,
    label,
    granularity,
    points,
    latestObservedAt: points.length ? points[points.length - 1].date : null,
  };
}

export function makeBundle(
  asOf: string,
  series: MetricSeries[],
  hashRibbons: HashRibbonPoint[] = [],
): ObservationBundle {
  return {
    asOf,
    series: Object.fromEntries(series.map((s) => [s.key, s])),
    hashRibbons,
  };
}

const GROUPS: Record<string, GroupConfig> = {
  network_security: { thesis_weight: 1.1, vol_class: 'high', allowed_vocab: ['hash rate', 'difficulty', 'miner economics'] },
  behaviour_valuation: { thesis_weight: 1.2, vol_class: 'high', allowed_vocab: ['on-chain activity', 'usage'] },
  trend_valuation: { thesis_weight: 1.0, vol_class: 'high', allowed_vocab: ['trend', 'momentum', 'range'] },
  market_snapshot: { thesis_weight: 0.7, vol_class: 'high', allowed_vocab: ['price', 'sentiment'] },
  money_supply: { thesis_weight: 1.4, vol_class: 'low', allowed_vocab: ['liquidity', 'expansion', 'contraction'] },
  policy_rate: { thesis_weight: 1.3, vol_class: 'low', allowed_vocab: ['policy', 'hold', 'cut', 'hike'] },
  equity: { thesis_weight: 0.9, vol_class: 'high', allowed_vocab: ['risk appetite', 'risk-on', 'risk-off'] },
};

export function makeConfig(overrides: Partial<FindingConfig> = {}): FindingConfig {
  return {
    catalog: {},
    metricConfig: GROUPS,
    divergencePairs: [],
    thresholds: [],
    tunables: DEFAULT_TUNABLES,
    ...overrides,
  };
}
