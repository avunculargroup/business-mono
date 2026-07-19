// Findings-engine data access: loads the observation series the computors read,
// and persists the daily market_reports row.
//
// Series are fetched per indicator (parallel) rather than in one view sweep so
// no query can brush the PostgREST row cap; each metric's lookback is its
// resolved trailing window plus a year of baseline margin.

import { supabase } from '@platform/db';
import type { Finding, MarketReportMode, MarketReportStatus } from '@platform/shared';
import { createLogger } from '../logger.js';
import { TREND_KEY_BY_COLUMN, type CatalogEntry, type FindingConfig, type Granularity } from './config.js';
import { resolvePeriod } from './resolver.js';
import type { SeriesPoint } from './stats.js';
import type { LintResult } from './schemas.js';

const log = createLogger('findings-data');

// market_reports and the series views are not in the generated Database types
// yet — cast to bypass typing (same pattern as feedbackDistillListener).
const db = supabase as any;

export interface MetricSeries {
  key: string;
  group: string;
  label: string;
  granularity: Granularity;
  // Oldest → newest, all dates <= asOf.
  points: SeriesPoint[];
  latestObservedAt: string | null;
}

export interface HashRibbonPoint {
  date: string;
  spreadPct: number;
  signal: 'capitulation' | 'recovery' | 'neutral';
}

export interface ObservationBundle {
  asOf: string;
  series: Record<string, MetricSeries>;
  // Oldest → newest hash-ribbons state series — drives the capitulation lock.
  hashRibbons: HashRibbonPoint[];
}

const BASELINE_MARGIN_DAYS = 365;
const MIN_LOOKBACK_DAYS = 450;

function sinceISO(asOf: string, days: number): string {
  const t = new Date(`${asOf}T00:00:00Z`).getTime() - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function lookbackDays(entry: CatalogEntry): number {
  return Math.max(MIN_LOOKBACK_DAYS, resolvePeriod(entry).windowDays + BASELINE_MARGIN_DAYS);
}

async function loadOnchainSeries(entry: CatalogEntry, asOf: string): Promise<SeriesPoint[]> {
  const { data, error } = await db
    .from('v_onchain_series')
    .select('observed_at, value')
    .eq('indicator_id', entry.indicatorId)
    .gte('observed_at', sinceISO(asOf, lookbackDays(entry)))
    .lte('observed_at', asOf)
    .order('observed_at', { ascending: true });
  if (error) throw new Error(`v_onchain_series read failed for ${entry.key}: ${error.message}`);
  return (data ?? [])
    .filter((r: { value: number | null }) => r.value != null)
    .map((r: { observed_at: string; value: number }) => ({ date: r.observed_at, value: Number(r.value) }));
}

async function loadMacroSeries(entry: CatalogEntry, asOf: string): Promise<SeriesPoint[]> {
  const { data, error } = await db
    .from('v_indicator_series')
    .select('period_date, value')
    .eq('indicator_id', entry.indicatorId)
    .gte('period_date', sinceISO(asOf, lookbackDays(entry)))
    .lte('period_date', asOf)
    .order('period_date', { ascending: true });
  if (error) throw new Error(`v_indicator_series read failed for ${entry.key}: ${error.message}`);
  return (data ?? [])
    .filter((r: { value: number | null }) => r.value != null)
    .map((r: { period_date: string; value: number }) => ({ date: r.period_date, value: Number(r.value) }));
}

// One v_btc_trend read pivots into every derived trend series.
async function loadTrendSeries(asOf: string): Promise<Record<string, SeriesPoint[]>> {
  const columns = Object.keys(TREND_KEY_BY_COLUMN);
  const { data, error } = await db
    .from('v_btc_trend')
    .select(`observed_at, ${columns.join(', ')}`)
    .gte('observed_at', sinceISO(asOf, MIN_LOOKBACK_DAYS))
    .lte('observed_at', asOf)
    .order('observed_at', { ascending: true });
  if (error) throw new Error(`v_btc_trend read failed: ${error.message}`);

  const byKey: Record<string, SeriesPoint[]> = {};
  for (const key of Object.values(TREND_KEY_BY_COLUMN)) byKey[key] = [];
  for (const row of data ?? []) {
    for (const [column, key] of Object.entries(TREND_KEY_BY_COLUMN)) {
      const v = row[column];
      if (v == null) continue;
      byKey[key].push({ date: row.observed_at, value: Number(v) });
    }
  }
  return byKey;
}

async function loadHashRibbons(asOf: string): Promise<HashRibbonPoint[]> {
  const { data, error } = await db
    .from('v_hash_ribbons')
    .select('observed_at, spread_pct, signal')
    .gte('observed_at', sinceISO(asOf, MIN_LOOKBACK_DAYS))
    .lte('observed_at', asOf)
    .order('observed_at', { ascending: true });
  if (error) throw new Error(`v_hash_ribbons read failed: ${error.message}`);
  return (data ?? [])
    .filter((r: { spread_pct: number | null }) => r.spread_pct != null)
    .map((r: { observed_at: string; spread_pct: number; signal: HashRibbonPoint['signal'] }) => ({
      date: r.observed_at,
      spreadPct: Number(r.spread_pct),
      signal: r.signal,
    }));
}

export async function loadObservationBundle(asOf: string, config: FindingConfig): Promise<ObservationBundle> {
  const entries = Object.values(config.catalog);
  const trendKeys = new Set(Object.values(TREND_KEY_BY_COLUMN));

  const [trendByKey, hashRibbons, ...perEntry] = await Promise.all([
    loadTrendSeries(asOf),
    loadHashRibbons(asOf),
    ...entries.map(async (entry): Promise<[CatalogEntry, SeriesPoint[]]> => {
      // Derived trend metrics come from the v_btc_trend pivot; hash_ribbons'
      // state series is loaded separately (its numeric row would be meaningless).
      if (trendKeys.has(entry.key) || entry.key === 'hash_ribbons') return [entry, []];
      const points =
        entry.source === 'macro' ? await loadMacroSeries(entry, asOf) : await loadOnchainSeries(entry, asOf);
      return [entry, points];
    }),
  ]);

  const series: Record<string, MetricSeries> = {};
  for (const [entry, points] of perEntry) {
    const resolved = trendKeys.has(entry.key) ? trendByKey[entry.key] ?? [] : points;
    if (entry.key === 'hash_ribbons') continue; // state series, not a numeric metric
    series[entry.key] = {
      key: entry.key,
      group: entry.group,
      label: entry.label,
      granularity: entry.granularity,
      points: resolved,
      latestObservedAt: resolved.length ? resolved[resolved.length - 1].date : null,
    };
  }

  return { asOf, series, hashRibbons };
}

// ── market_reports persistence ────────────────────────────────────────────────

export interface MarketReportRow {
  as_of: string;
  status: MarketReportStatus;
  report_mode: MarketReportMode;
  narration_markdown: string | null;
  findings: Finding[];
  ops_findings: Finding[];
  lint_result: LintResult | null;
  lex_result: unknown | null;
}

/** Upsert on as_of — a re-run overwrites that day's report. Returns the row id, or null on failure (logged). */
export async function upsertMarketReport(row: MarketReportRow): Promise<string | null> {
  const { data, error } = await db
    .from('market_reports')
    .upsert(
      {
        as_of: row.as_of,
        status: row.status,
        report_mode: row.report_mode,
        narration_markdown: row.narration_markdown,
        findings: row.findings,
        ops_findings: row.ops_findings,
        lint_result: row.lint_result,
        lex_result: row.lex_result,
        emailed: false,
      },
      { onConflict: 'as_of' },
    )
    .select('id')
    .single();
  if (error) {
    log.error({ err: error, asOf: row.as_of }, 'market_reports upsert failed');
    return null;
  }
  return data?.id ?? null;
}

/** Best-effort: mark the day's report as included in a delivered email. */
export async function markReportEmailed(reportId: string): Promise<void> {
  const { error } = await db.from('market_reports').update({ emailed: true }).eq('id', reportId);
  if (error) log.warn({ err: error, reportId }, 'market_reports emailed flag update failed');
}
