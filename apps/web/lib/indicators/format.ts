import type { Database } from '@platform/db';

export type IndicatorLatest = Database['public']['Views']['v_indicator_latest']['Row'];
export type IndicatorSeriesPoint = Database['public']['Views']['v_indicator_series']['Row'];

/** A print released within this many days gets the gold freshness marker. */
export const FRESH_DAYS = 7;

const UNIT_LABELS: Record<string, string> = {
  percent: '%',
  usd_billion: 'USD bn',
  aud_billion: 'AUD bn',
  index: 'index',
};

const CATEGORY_LABELS: Record<string, string> = {
  policy_rate: 'Policy rate',
  money_supply: 'Money supply',
  inflation: 'Inflation',
};

export function unitLabel(unit: string | null): string {
  if (!unit) return '';
  return UNIT_LABELS[unit] ?? unit;
}

export function categoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}

export function formatValue(value: number, decimals: number): string {
  return value.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// period_date / released_at are DATE strings — parse as UTC so a card in any
// timezone shows the stated calendar month/day, never a tz-shifted neighbour.
function utcDate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

/** 'April 2026' from a period DATE. */
export function formatPeriod(period: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(utcDate(period));
}

/** '27 May' from a DATE. */
export function formatDay(d: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(utcDate(d));
}

export function isFresh(daysSinceRelease: number | null): boolean {
  return daysSinceRelease != null && daysSinceRelease <= FRESH_DAYS;
}

export interface Delta {
  kind: 'flat' | 'up' | 'down';
  magnitude: string;
  pct: string | null;
}

/** Change since the prior period — direction only, never good/bad. */
export function computeDelta(row: IndicatorLatest): Delta {
  const c = row.change_since_prior;
  if (c == null || c === 0) return { kind: 'flat', magnitude: '', pct: null };
  const up = c > 0;
  const decimals = row.decimals ?? 2;
  const sign = up ? '+' : '−'; // − minus sign
  const magnitude = `${sign}${formatValue(Math.abs(c), decimals)}`;
  const pct =
    row.pct_change_since_prior != null
      ? `${sign}${Math.abs(row.pct_change_since_prior).toFixed(2)}%`
      : null;
  return { kind: up ? 'up' : 'down', magnitude, pct };
}

export interface YoyStat {
  label: string;
  text: string;
}

/**
 * The view exposes both YoY columns; the card picks by category:
 *   policy_rate  → yoy_change      (percentage points)
 *   inflation    → yoy_pct_change  (the annual inflation rate)
 *   money_supply → yoy_pct_change  (the money-growth / debasement rate)
 */
export function pickYoy(row: IndicatorLatest): YoyStat | null {
  if (row.category === 'policy_rate') {
    if (row.yoy_change == null) return null;
    const sign = row.yoy_change >= 0 ? '+' : '−';
    return { label: 'vs 1yr', text: `${sign}${Math.abs(row.yoy_change).toFixed(row.decimals ?? 2)}pp` };
  }
  if (row.yoy_pct_change == null) return null;
  const sign = row.yoy_pct_change >= 0 ? '+' : '−';
  return { label: 'YoY', text: `${sign}${Math.abs(row.yoy_pct_change).toFixed(1)}%` };
}

export interface Spark {
  d: string;
  last: [number, number];
  w: number;
  h: number;
}

/** Restrained sparkline path. Returns null when there aren't enough points. */
export function sparklinePath(series: number[], w = 240, h = 36, pad = 3): Spark | null {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i): [number, number] => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return { d, last: pts[pts.length - 1], w, h };
}
