// Pure statistical helpers for the finding computors. No I/O, no LLM.
//
// The monthly-reprint rule lives here, once: a monthly-granularity series is
// stored on its poll cadence, so identical consecutive values between prints
// are stale reprints, not data — periodDeltas collapses them before any delta
// or distribution is computed.

import type { FindingBaseline } from '@platform/shared';
import type { PeriodResolution } from './resolver.js';

export interface SeriesPoint {
  date: string; // ISO date
  value: number;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Linear-interpolated percentile (p in 0..1) of a value list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Fraction of `values` strictly below `x`, with ties counted half — the standard
 * mid-rank so a value equal to the whole sample ranks 0.5, not 0 or 1.
 */
export function percentileRank(values: number[], x: number): number {
  if (values.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below += 1;
    else if (v === x) equal += 1;
  }
  return (below + equal / 2) / values.length;
}

/**
 * 0..1 distance from the middle of the distribution — 0 at the median, 1 at
 * either extreme tail. `unusualness >= 0.9` means beyond p95 or below p05.
 */
export function unusualnessOf(values: number[], x: number): number {
  return Math.min(1, 2 * Math.abs(percentileRank(values, x) - 0.5));
}

export function baselineOf(values: number[]): FindingBaseline {
  return {
    mean: mean(values),
    sd: sd(values),
    p05: percentile(values, 0.05),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

export interface PeriodDelta {
  date: string; // date of the later observation
  // Percent change vs the prior period value, or the absolute change when the
  // prior value is 0 (avoids infinities on sparse series).
  pct: number;
  abs: number;
  value: number; // the later observation's value
  prior: number;
}

/**
 * Collapse a series to one representative point per period. Daily series pass
 * through unchanged; monthly/quarterly series keep the LAST distinct value per
 * period, dropping identical consecutive values (stale reprints between prints).
 */
export function collapseToPeriods(points: SeriesPoint[], resolution: PeriodResolution): SeriesPoint[] {
  if (resolution.period === 'day') return points;

  const periodOf = (date: string) => {
    if (resolution.period === 'month') return date.slice(0, 7); // YYYY-MM
    const month = Number(date.slice(5, 7));
    return `${date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
  };

  // Last point per period wins (points arrive oldest → newest).
  const byPeriod = new Map<string, SeriesPoint>();
  for (const p of points) byPeriod.set(periodOf(p.date), p);

  // Drop consecutive identical values — a monthly figure that reprints
  // unchanged across polls is not a new observation.
  const collapsed: SeriesPoint[] = [];
  for (const p of byPeriod.values()) {
    if (collapsed.length > 0 && collapsed[collapsed.length - 1].value === p.value) continue;
    collapsed.push(p);
  }
  return collapsed;
}

/**
 * Period-over-period deltas for a series, after period collapsing. Oldest →
 * newest. A monthly series yields one delta per print that actually changed.
 */
export function periodDeltas(points: SeriesPoint[], resolution: PeriodResolution): PeriodDelta[] {
  const collapsed = collapseToPeriods(points, resolution);
  const deltas: PeriodDelta[] = [];
  for (let i = 1; i < collapsed.length; i++) {
    const prior = collapsed[i - 1].value;
    const value = collapsed[i].value;
    const abs = value - prior;
    deltas.push({
      date: collapsed[i].date,
      pct: prior !== 0 ? (abs / Math.abs(prior)) * 100 : abs,
      abs,
      value,
      prior,
    });
  }
  return deltas;
}

/** Last value per calendar month, oldest → newest. For divergence resampling. */
export function resampleToMonthly(points: SeriesPoint[]): SeriesPoint[] {
  const byMonth = new Map<string, SeriesPoint>();
  for (const p of points) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()];
}

/** Pearson correlation of two equal-length value arrays; 0 when degenerate. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * Trailing correlation series over aligned-by-date pairs: one correlation per
 * end-date, each over the previous `windowPeriods` aligned observations.
 * Returns the dates alongside so the caller can baseline the tail against the
 * rest. Dates present in only one series are dropped.
 */
export function rollingCorrelation(
  a: SeriesPoint[],
  b: SeriesPoint[],
  windowPeriods: number,
): Array<{ date: string; corr: number }> {
  const bByDate = new Map(b.map((p) => [p.date, p.value]));
  const aligned = a
    .filter((p) => bByDate.has(p.date))
    .map((p) => ({ date: p.date, av: p.value, bv: bByDate.get(p.date)! }));

  const out: Array<{ date: string; corr: number }> = [];
  for (let end = windowPeriods; end <= aligned.length; end++) {
    const win = aligned.slice(end - windowPeriods, end);
    out.push({
      date: win[win.length - 1].date,
      corr: pearson(win.map((w) => w.av), win.map((w) => w.bv)),
    });
  }
  return out;
}

/**
 * Length of the trailing run (from the end of the list) for which `predicate`
 * holds. E.g. consecutive periods a value stayed inside a band.
 */
export function trailingRunLength<T>(items: T[], predicate: (item: T) => boolean): number {
  let run = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (!predicate(items[i])) break;
    run += 1;
  }
  return run;
}
