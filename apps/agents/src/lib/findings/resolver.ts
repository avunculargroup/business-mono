// Granularity resolution — the spec's "landmine handled first". Comparison
// windows come from the catalog's period granularity, never the poll cadence:
// computing "change since yesterday" on a monthly series would report nothing
// most days and a false one-day anomaly when the print lands.

import type { CatalogEntry } from './config.js';

export type FindingPeriodName = 'day' | 'month' | 'quarter';

export interface PeriodResolution {
  period: FindingPeriodName;
  // Trailing window in periods (what the stats are computed over).
  windowPeriods: number;
  // The same window expressed in calendar days (what the query fetches).
  windowDays: number;
}

const RESOLUTIONS: Record<CatalogEntry['granularity'], PeriodResolution> = {
  daily: { period: 'day', windowPeriods: 90, windowDays: 90 },
  monthly: { period: 'month', windowPeriods: 24, windowDays: 730 },
  quarterly: { period: 'quarter', windowPeriods: 12, windowDays: 1095 },
};

export function resolvePeriod(entry: CatalogEntry): PeriodResolution {
  return RESOLUTIONS[entry.granularity];
}
