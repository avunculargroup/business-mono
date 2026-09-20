/**
 * The `startPeriod` an SDMX request asks for.
 *
 * SDMX windows by period rather than by row count — there is no `limit` — so
 * the workflow's `limit` (how many observations it wants) has to become a date
 * far enough back to contain that many periods. Getting this wrong in the
 * generous direction costs a larger response; getting it wrong in the mean
 * direction silently truncates the backfill, so it rounds up.
 *
 * Kept apart from `sdmx.ts` so the arithmetic is testable without a payload.
 */

import type { PeriodGranularity } from '../types.js';

const DEFAULT_PERIODS = 18;

/** Months spanned by one period of each granularity. Daily is handled apart. */
const MONTHS_PER_PERIOD: Record<Exclude<PeriodGranularity, 'daily'>, number> = {
  monthly: 1,
  quarterly: 3,
};

/**
 * ISO 'YYYY-MM-DD' far enough back to cover `periods` observations.
 *
 * One period of slack is added on top, because a start date that lands exactly
 * on a period boundary can exclude it depending on how the provider compares
 * dates, and one period short of a YoY window is a YoY that does not compute.
 */
export function startPeriodFor(
  granularity: PeriodGranularity,
  periods: number = DEFAULT_PERIODS,
  now: Date = new Date(),
): string {
  const wanted = Math.max(1, periods) + 1;

  if (granularity === 'daily') {
    const from = new Date(now.getTime() - wanted * 86_400_000);
    return from.toISOString().slice(0, 10);
  }

  const months = wanted * MONTHS_PER_PERIOD[granularity];
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return from.toISOString().slice(0, 10);
}
