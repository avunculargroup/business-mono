// Formatters over the repository's read models, rather than over generated view
// rows: the page is fed by a repository now, and these shape what it returns
// for display. The deltas stay here on purpose — the read model carries signed
// numbers and no direction, and turning a sign into an arrow is presentation.
import type { IndicatorLatest, IndicatorSeriesPoint } from '@platform/data';

export type { IndicatorLatest, IndicatorSeriesPoint };

/** A print released within this many days gets the gold freshness marker. */
export const FRESH_DAYS = 7;

const UNIT_LABELS: Record<string, string> = {
  percent: '%',
  usd_billion: 'USD bn',
  aud_billion: 'AUD bn',
  index: 'index',
  usd: 'USD',
};

const CATEGORY_LABELS: Record<string, string> = {
  policy_rate: 'Policy rate',
  money_supply: 'Money supply',
  inflation: 'Inflation',
  activity: 'Activity',
  fx: 'Currency',
  commodity: 'Commodity',
  equity: 'Equities',
  bond_yield: 'Bond yield',
};

export function unitLabel(unit: string | null): string {
  if (!unit) return '';
  return UNIT_LABELS[unit] ?? unit;
}

export function categoryLabel(category: string | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category] ?? category;
}

/** True for daily-cadence series (market tickers). Cast because the generated
 *  view type lags the migration that added period_granularity — the value is
 *  absent (→ false) until the view ships, which is the correct fallback. */
export function isDailyGranularity(row: IndicatorLatest): boolean {
  return row.periodGranularity === 'daily';
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
  const c = row.changeSincePrior;
  if (c == null || c === 0) return { kind: 'flat', magnitude: '', pct: null };
  const up = c > 0;
  const decimals = row.decimals ?? 2;
  const sign = up ? '+' : '−'; // − minus sign
  const magnitude = `${sign}${formatValue(Math.abs(c), decimals)}`;
  // A 0-centred diffusion index (activity) can cross zero, so a percent change is
  // meaningless (−0.4 from 26.7 is not "−101%"). Absolute points only.
  const pct =
    row.category !== 'activity' && row.pctChangeSincePrior != null
      ? `${sign}${Math.abs(row.pctChangeSincePrior).toFixed(2)}%`
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
 *   activity     → yoy_change      (diffusion-index points; pct is meaningless)
 *   inflation    → yoy_pct_change  (the annual inflation rate)
 *   money_supply → yoy_pct_change  (the money-growth / debasement rate)
 */
export function pickYoy(row: IndicatorLatest): YoyStat | null {
  if (row.category === 'policy_rate') {
    if (row.yoyChange == null) return null;
    const sign = row.yoyChange >= 0 ? '+' : '−';
    return { label: 'vs 1yr', text: `${sign}${Math.abs(row.yoyChange).toFixed(row.decimals ?? 2)}pp` };
  }
  // Activity is a 0-centred diffusion index — YoY as absolute points, not percent.
  if (row.category === 'activity') {
    if (row.yoyChange == null) return null;
    const sign = row.yoyChange >= 0 ? '+' : '−';
    return { label: 'vs 1yr', text: `${sign}${Math.abs(row.yoyChange).toFixed(row.decimals ?? 1)} pts` };
  }
  if (row.yoyPctChange == null) return null;
  const sign = row.yoyPctChange >= 0 ? '+' : '−';
  return { label: 'YoY', text: `${sign}${Math.abs(row.yoyPctChange).toFixed(1)}%` };
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
