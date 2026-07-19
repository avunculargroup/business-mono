// Helpers shared by the finding computors. All pure.

import type { Finding } from '@platform/shared';
import type { FindingConfig } from '../config.js';
import type { MetricSeries } from '../dataAccess.js';
import { resolvePeriod, type PeriodResolution } from '../resolver.js';

// Deterministic id: one finding of a type per metric per day.
export function findingId(type: string, metricKey: string, asOf: string, extra?: string): string {
  return [type, metricKey, extra, asOf].filter(Boolean).join(':');
}

export function vocabFor(config: FindingConfig, group: string): string[] {
  return config.metricConfig[group]?.allowed_vocab ?? [];
}

export function volClassFor(config: FindingConfig, group: string): 'low' | 'high' {
  return config.metricConfig[group]?.vol_class ?? 'low';
}

// Single-period moves in noisy series are weather, not verdicts.
export function verdictAllowed(persistencePeriods: number, volClass: 'low' | 'high'): boolean {
  return !(persistencePeriods <= 1 && volClass === 'high');
}

export function resolutionFor(series: MetricSeries): PeriodResolution {
  return resolvePeriod({ granularity: series.granularity } as Parameters<typeof resolvePeriod>[0]);
}

export function evidenceRefs(series: MetricSeries, dates: string[]): string[] {
  const view = series.key.startsWith('macro:') ? 'v_indicator_series' : 'v_onchain_series';
  return [`view:${view}`, `key:${series.key}`, ...dates.map((d) => `date:${d}`)];
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** True when `date` is within `days` calendar days of asOf (inclusive). */
export function isFresh(date: string, asOf: string, days: number): boolean {
  const gap = (new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000;
  return gap >= 0 && gap <= days;
}

// Findings leave the computors unscored; scoreAndSelect sets materiality.
export const UNSCORED = 0;

export type FindingDraft = Finding;
