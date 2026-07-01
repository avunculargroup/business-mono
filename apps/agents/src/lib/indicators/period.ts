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

function isoDate(year: number, monthZeroBased: number, day: number): string {
  const mm = String(monthZeroBased + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
