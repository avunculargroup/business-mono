/**
 * Period normalisation — one convention, enforced everywhere.
 *
 * Providers disagree on how to stamp a period: FRED dates monthly series to the
 * first of the month, RBA to end-of-month, ABS uses '2026-Q1'. If adapters passed
 * these through raw, the v_indicator_latest prior/YoY joins (which match on
 * period_date) would silently misalign across series.
 *
 * Rule: every adapter normalises periodDate to the FIRST day of the reference
 * period. Monthly → first of that month; quarterly → first of that quarter. The
 * YoY calendar-year join in the view depends on this; it is a hard convention.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type { PeriodGranularity } from './types.js';

/** ISO 'YYYY-MM-DD' for the exact day of `date` (UTC). For daily series, whose
 *  reference period IS the day — no collapse to first-of-period. */
export function toISODateUTC(date: Date): string {
  return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** ISO 'YYYY-MM-DD' for the first day of the month containing `date` (UTC). */
export function toFirstOfMonthISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  return isoDate(y, m, 1);
}

/** ISO 'YYYY-MM-DD' for the first day of the quarter containing `date` (UTC). */
export function toFirstOfQuarterISO(date: Date): string {
  const y = date.getUTCFullYear();
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3; // 0,3,6,9
  return isoDate(y, quarterStartMonth, 1);
}

/**
 * Parse an RBA-style date cell ('30/06/2026', '31/12/2025' — DD/MM/YYYY, the
 * format RBA's statistical-table CSVs actually use) and normalise to the
 * first of that month. Returns null if it can't be parsed.
 */
export function parseRbaDateToFirstOfMonth(cell: string): string | null {
  const m = cell.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return isoDate(Number(m[3]), month - 1, 1);
}

/**
 * Parse an SDMX `TIME_PERIOD` value and normalise it to the first day of its
 * reference period.
 *
 * SDMX stamps the period type into the string itself — `2026`, `2026-Q1`,
 * `2026-01`, `2026-01-15` — so the *value* decides the period, not the
 * registry's `period_granularity`. A series that prints `2026-Q1` is quarterly
 * whatever the row says, and collapsing it by the row's granularity instead
 * would misfile it the moment the two disagree.
 *
 * `granularity` therefore only settles the one genuinely ambiguous case: a full
 * date. A daily series keeps the day; anything else collapses it.
 *
 * Returns null for a period this does not understand — weeks (`2026-W01`) and
 * semesters (`2026-S1`) among them — so the caller can fail with the offending
 * value rather than guess at it.
 */
export function parseSdmxTimePeriod(
  raw: string,
  granularity: PeriodGranularity = 'monthly',
): string | null {
  const value = raw.trim();

  // 2026
  const annual = value.match(/^(\d{4})$/);
  if (annual) return isoDate(Number(annual[1]), 0, 1);

  // 2026-Q1 (also accepts the bare 2026Q1 some providers emit)
  const quarterly = value.match(/^(\d{4})-?Q([1-4])$/i);
  if (quarterly) return isoDate(Number(quarterly[1]), (Number(quarterly[2]) - 1) * 3, 1);

  // 2026-01
  const monthly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    const month = Number(monthly[2]);
    if (month < 1 || month > 12) return null;
    return isoDate(Number(monthly[1]), month - 1, 1);
  }

  // 2026-01-15, or a full timestamp — the only case granularity decides.
  const daily = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (daily) {
    const month = Number(daily[2]);
    const day = Number(daily[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(Number(daily[1]), month - 1, day));
    if (granularity === 'daily') return toISODateUTC(date);
    if (granularity === 'quarterly') return toFirstOfQuarterISO(date);
    return toFirstOfMonthISO(date);
  }

  return null;
}

function isoDate(year: number, monthZeroBased: number, day: number): string {
  const mm = String(monthZeroBased + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
