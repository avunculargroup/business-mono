import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  computeDelta,
  formatDay,
  formatPeriod,
  formatValue,
  isFresh,
  pickYoy,
  sparklinePath,
  unitLabel,
  type IndicatorLatest,
} from './format';

function row(overrides: Partial<IndicatorLatest> = {}): IndicatorLatest {
  return {
    indicator_id: 'i1',
    name: 'US M2 Money Supply',
    short_label: 'US M2',
    region: 'us',
    category: 'money_supply',
    unit: 'usd_billion',
    decimals: 1,
    period_date: '2026-05-01',
    current_value: 21399,
    released_at: '2026-05-27',
    is_revision: false,
    superseded_value: null,
    prior_value: 21330,
    change_since_prior: 69,
    pct_change_since_prior: 0.32,
    year_ago_value: 21000,
    year_ago_period: '2025-05-01',
    yoy_change: 399,
    yoy_pct_change: 1.9,
    days_since_release: 3,
    typical_release_gap_days: 31,
    expected_next_release: '2026-06-27',
    ...overrides,
  } as IndicatorLatest;
}

describe('labels', () => {
  it('maps unit and category tokens to display labels', () => {
    expect(unitLabel('usd_billion')).toBe('USD bn');
    expect(unitLabel('percent')).toBe('%');
    expect(categoryLabel('policy_rate')).toBe('Policy rate');
    expect(categoryLabel('activity')).toBe('Activity');
    expect(unitLabel(null)).toBe('');
  });
});

describe('formatValue', () => {
  it('groups thousands and respects decimals', () => {
    expect(formatValue(21399, 1)).toBe('21,399.0');
    expect(formatValue(3.85, 2)).toBe('3.85');
  });
});

describe('UTC-safe date formatting (DATE columns must not tz-shift)', () => {
  it('formats the period and release day from the stated calendar date', () => {
    expect(formatPeriod('2026-05-01')).toBe('May 2026');
    expect(formatDay('2026-05-27')).toBe('27 May');
  });
});

describe('isFresh', () => {
  it('is true within the window and false outside / when null', () => {
    expect(isFresh(3)).toBe(true);
    expect(isFresh(7)).toBe(true);
    expect(isFresh(8)).toBe(false);
    expect(isFresh(null)).toBe(false);
  });
});

describe('computeDelta', () => {
  it('reports an up move with a percent', () => {
    expect(computeDelta(row())).toEqual({ kind: 'up', magnitude: '+69.0', pct: '+0.32%' });
  });
  it('reports a down move with the minus sign', () => {
    const d = computeDelta(row({ change_since_prior: -0.25, pct_change_since_prior: null, decimals: 2 }));
    expect(d.kind).toBe('down');
    expect(d.magnitude).toBe('−0.25');
    expect(d.pct).toBeNull();
  });
  it('is flat when unchanged or null', () => {
    expect(computeDelta(row({ change_since_prior: 0 })).kind).toBe('flat');
    expect(computeDelta(row({ change_since_prior: null })).kind).toBe('flat');
  });
  it('suppresses percent for a 0-centred activity diffusion index', () => {
    // Philly Fed: 26.7 → -0.4, a -27.1 point move that pct would render as ~ -101%.
    const d = computeDelta(
      row({ category: 'activity', decimals: 1, change_since_prior: -27.1, pct_change_since_prior: -101.5 }),
    );
    expect(d).toEqual({ kind: 'down', magnitude: '−27.1', pct: null });
  });
});

describe('pickYoy (category-driven)', () => {
  it('uses absolute pp for policy rates', () => {
    const y = pickYoy(row({ category: 'policy_rate', decimals: 2, yoy_change: -0.5, yoy_pct_change: -11 }));
    expect(y).toEqual({ label: 'vs 1yr', text: '−0.50pp' });
  });
  it('uses percent for inflation / money supply', () => {
    expect(pickYoy(row({ category: 'money_supply' }))).toEqual({ label: 'YoY', text: '+1.9%' });
  });
  it('uses absolute points for an activity diffusion index', () => {
    const y = pickYoy(row({ category: 'activity', decimals: 1, yoy_change: -5.2, yoy_pct_change: -130 }));
    expect(y).toEqual({ label: 'vs 1yr', text: '−5.2 pts' });
  });
  it('returns null when the relevant column is null', () => {
    expect(pickYoy(row({ category: 'money_supply', yoy_pct_change: null }))).toBeNull();
  });
});

describe('sparklinePath', () => {
  it('returns a path and last point for >= 2 values', () => {
    const spark = sparklinePath([1, 2, 3], 240, 36, 3);
    expect(spark).not.toBeNull();
    expect(spark!.d.startsWith('M')).toBe(true);
    expect(spark!.last[0]).toBeCloseTo(237); // last x = w - pad
  });
  it('returns null with fewer than 2 points', () => {
    expect(sparklinePath([1])).toBeNull();
  });
});
