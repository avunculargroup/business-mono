import { describe, it, expect } from 'vitest';
import {
  mean,
  sd,
  percentile,
  percentileRank,
  unusualnessOf,
  baselineOf,
  collapseToPeriods,
  periodDeltas,
  resampleToMonthly,
  pearson,
  rollingCorrelation,
  trailingRunLength,
  type SeriesPoint,
} from './stats.js';
import { resolvePeriod } from './resolver.js';
import type { CatalogEntry } from './config.js';

const DAILY = resolvePeriod({ granularity: 'daily' } as CatalogEntry);
const MONTHLY = resolvePeriod({ granularity: 'monthly' } as CatalogEntry);
const QUARTERLY = resolvePeriod({ granularity: 'quarterly' } as CatalogEntry);

function series(values: number[], startDay = 1): SeriesPoint[] {
  return values.map((value, i) => {
    const d = new Date(Date.UTC(2026, 0, startDay + i));
    return { date: d.toISOString().slice(0, 10), value };
  });
}

describe('basic stats', () => {
  it('mean and sd', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 2, 2])).toBe(0);
    expect(sd([1, 3])).toBeCloseTo(Math.SQRT2, 5);
  });

  it('percentile interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('percentileRank / unusualness', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

  it('ranks both tails symmetrically', () => {
    expect(percentileRank(values, 0)).toBe(0);
    expect(percentileRank(values, 200)).toBe(1);
    expect(percentileRank(values, 50)).toBeCloseTo(0.495, 3);
  });

  it('unusualness is 0 at the median, 1 at either extreme', () => {
    expect(unusualnessOf(values, 50.5)).toBeCloseTo(0, 2);
    expect(unusualnessOf(values, -10)).toBe(1);
    expect(unusualnessOf(values, 500)).toBe(1);
  });

  it('a value equal to the whole sample ranks mid, not extreme', () => {
    expect(percentileRank([5, 5, 5, 5], 5)).toBe(0.5);
    expect(unusualnessOf([5, 5, 5, 5], 5)).toBe(0);
  });

  it('baselineOf carries the distribution', () => {
    const b = baselineOf(values);
    expect(b.p05).toBeCloseTo(5.95, 1);
    expect(b.p50).toBeCloseTo(50.5, 1);
    expect(b.p95).toBeCloseTo(95.05, 1);
  });
});

describe('collapseToPeriods / periodDeltas — the monthly reprint rule', () => {
  it('daily series pass through unchanged', () => {
    const pts = series([1, 2, 3]);
    expect(collapseToPeriods(pts, DAILY)).toEqual(pts);
  });

  it('keeps the last value per month and drops identical reprints', () => {
    // Weekly polls of a monthly series: Jan prints 100 four times, Feb prints
    // 101 four times, Mar reprints 101 (no actual new print).
    const pts: SeriesPoint[] = [
      { date: '2026-01-03', value: 100 },
      { date: '2026-01-10', value: 100 },
      { date: '2026-01-24', value: 100 },
      { date: '2026-02-07', value: 101 },
      { date: '2026-02-21', value: 101 },
      { date: '2026-03-07', value: 101 },
    ];
    const collapsed = collapseToPeriods(pts, MONTHLY);
    expect(collapsed).toEqual([
      { date: '2026-01-24', value: 100 },
      { date: '2026-02-21', value: 101 },
    ]);

    const deltas = periodDeltas(pts, MONTHLY);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].pct).toBeCloseTo(1, 5);
    expect(deltas[0].date).toBe('2026-02-21');
  });

  it('buckets quarterly series by quarter', () => {
    const pts: SeriesPoint[] = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-04-01', value: 12 },
      { date: '2026-07-01', value: 11 },
    ];
    expect(collapseToPeriods(pts, QUARTERLY)).toHaveLength(3);
    expect(periodDeltas(pts, QUARTERLY)).toHaveLength(2);
  });

  it('uses absolute change when the prior value is 0', () => {
    const deltas = periodDeltas(series([0, 5]), DAILY);
    expect(deltas[0].pct).toBe(5);
    expect(deltas[0].abs).toBe(5);
  });
});

describe('resampleToMonthly', () => {
  it('keeps the last value per calendar month', () => {
    const pts: SeriesPoint[] = [
      { date: '2026-01-05', value: 1 },
      { date: '2026-01-30', value: 2 },
      { date: '2026-02-10', value: 3 },
    ];
    expect(resampleToMonthly(pts)).toEqual([
      { date: '2026-01-30', value: 2 },
      { date: '2026-02-10', value: 3 },
    ]);
  });
});

describe('pearson / rollingCorrelation', () => {
  it('detects perfect positive and negative correlation', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 5);
    expect(pearson([1, 1, 1], [2, 4, 6])).toBe(0); // degenerate
  });

  it('rolls a window over date-aligned pairs', () => {
    const a = series([1, 2, 3, 4, 5, 6]);
    const b = series([2, 4, 6, 8, 10, 12]);
    const out = rollingCorrelation(a, b, 3);
    expect(out).toHaveLength(4);
    expect(out[out.length - 1].corr).toBeCloseTo(1, 5);
    expect(out[out.length - 1].date).toBe(a[5].date);
  });

  it('drops dates present in only one series', () => {
    const a = series([1, 2, 3, 4], 1);
    const b = series([2, 4, 6, 8], 3); // overlaps on days 3-4 only
    expect(rollingCorrelation(a, b, 3)).toHaveLength(0);
  });
});

describe('trailingRunLength', () => {
  it('counts from the end until the predicate fails', () => {
    expect(trailingRunLength([1, 9, 9, 9], (v) => v === 9)).toBe(3);
    expect(trailingRunLength([9, 9, 1], (v) => v === 9)).toBe(0);
    expect(trailingRunLength([], () => true)).toBe(0);
  });
});
