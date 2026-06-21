import type { Database } from '@platform/db';
// Reuse the pure, generic formatters from the macro layer — value formatting and
// the sparkline path are identical here. Onchain-specific labels, deltas, the
// signal chip, and the MVRV range marker live below.
import { formatValue, sparklinePath, type Spark } from '@/lib/indicators/format';

export { formatValue, sparklinePath };
export type { Spark };

export type OnchainDashboardRow = Database['public']['Views']['v_onchain_dashboard']['Row'];
export type OnchainSeriesPoint = Database['public']['Views']['v_onchain_series']['Row'];

/** An observation this recent gets the gold freshness marker. On-chain data is
 *  daily, so the window is tight. */
export const FRESH_DAYS = 2;

const UNIT_LABELS: Record<string, string> = {
  eh_s: 'EH/s',
  ratio: '',
  usd: 'USD',
  percent: '%',
  count: '',
  signal: '',
  btc: 'BTC',
};

const GROUP_LABELS: Record<string, string> = {
  network_security: 'Network security',
  behaviour_valuation: 'Holder behaviour & valuation',
};

export function unitLabel(unit: string | null): string {
  if (!unit) return '';
  return UNIT_LABELS[unit] ?? unit;
}

export function groupLabel(group: string | null): string {
  if (!group) return '';
  return GROUP_LABELS[group] ?? group;
}

/** '20 Jun 2026' from a DATE string, parsed as UTC so the stated calendar day
 *  never tz-shifts. */
export function formatDay(d: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${d}T00:00:00Z`));
}

export function isFresh(daysSinceObserved: number | null): boolean {
  return daysSinceObserved != null && daysSinceObserved <= FRESH_DAYS;
}

export interface Delta {
  kind: 'flat' | 'up' | 'down';
  magnitude: string;
  pct: string | null;
}

/** Change since the prior observation — direction only, never good/bad. Derived
 *  metrics carry NULL deltas in v1; those render as 'flat' and the card hides them. */
export function computeDelta(row: OnchainDashboardRow): Delta {
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

/** The displayed value, formatted. The forward difficulty estimate is signed (it
 *  can be negative); everything else uses the plain locale format. */
export function displayValue(row: OnchainDashboardRow): string {
  if (row.value == null) return '';
  const decimals = row.decimals ?? 2;
  if (row.key === 'next_difficulty_adjustment') {
    const sign = row.value >= 0 ? '+' : '−';
    return `${sign}${formatValue(Math.abs(row.value), decimals)}`;
  }
  return formatValue(row.value, decimals);
}

export type SignalState = 'recovery' | 'capitulation' | 'neutral';

/** Hash-Ribbons signal as a neutral state. NEVER mapped to buy/sell or a colour
 *  semantic — the chip states what the cross IS, not what to DO. */
export function signalState(row: OnchainDashboardRow): SignalState | null {
  const s = row.signal;
  if (s === 'recovery' || s === 'capitulation' || s === 'neutral') return s;
  return null;
}

/** Where the current value sits within its own observed history, as a 0–1
 *  fraction (0 = series low, 1 = series high). Returns null when there isn't
 *  enough history. This is historical CONTEXT, not a cheap/expensive judgement —
 *  the marker is deliberately colour-neutral. */
export function rangePosition(current: number | null, series: number[]): {
  fraction: number;
  min: number;
  max: number;
} | null {
  if (current == null || series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (max === min) return null;
  const clamped = Math.min(max, Math.max(min, current));
  return { fraction: (clamped - min) / (max - min), min, max };
}

/** Top-pool share above this percent gets a quiet decentralisation note. */
export const POOL_CONCENTRATION_NOTE_THRESHOLD = 35;
