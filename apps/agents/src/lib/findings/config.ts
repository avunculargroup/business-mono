// Findings-engine config loader: unifies the two indicator catalogs
// (onchain_indicators + economic_indicators) under one metric-key namespace and
// loads the seed tables from 20260720000000_add_findings_engine.sql.
//
// Every seeded divergence pair / threshold is validated against the loaded
// catalog; unresolvable rows are dropped with a log rather than throwing — a
// stale seed must never sink the daily report.

import { supabase } from '@platform/db';
import { macroMetricKey } from '@platform/shared';
import { createLogger } from '../logger.js';

const log = createLogger('findings-config');

// finding_* tables and period_granularity are not in the generated Database
// types yet — cast to bypass typing (same pattern as feedbackDistillListener).
const db = supabase as any;

export type Granularity = 'daily' | 'monthly' | 'quarterly';

export interface CatalogEntry {
  key: string; // unified metric key
  group: string; // onchain metric_group / macro category
  label: string; // short display label
  source: 'onchain' | 'onchain_derived' | 'macro';
  granularity: Granularity;
  indicatorId: string;
}

export interface GroupConfig {
  thesis_weight: number;
  vol_class: 'low' | 'high';
  allowed_vocab: string[];
}

export interface DivergencePair {
  primary_key: string;
  secondary_key: string;
  expected_sign: 'positive' | 'negative';
  corr_window_days: number;
  break_threshold: number;
}

export interface ThresholdRow {
  metric_key: string;
  level_name: string;
  level_value: number;
  cross_direction: 'up' | 'down' | 'either';
  compliance_class: 'informational' | 'valuation_sensitive';
}

export interface Tunables {
  // unusualness floor for an anomaly finding (p90 either tail).
  anomalyFloor: number;
  // Materiality: keeps an unusual-but-small move alive.
  baseMagnitude: number;
  // Materiality: large-move amplifier.
  kMag: number;
  // Materiality floor — below this on every finding → quiet day.
  floor: number;
  // Hard ceiling on findings per report, never a target.
  maxFindings: number;
}

export const DEFAULT_TUNABLES: Tunables = {
  anomalyFloor: 0.9,
  baseMagnitude: 0.6,
  kMag: 0.4,
  floor: 0.35,
  maxFindings: 3,
};

export interface FindingConfig {
  catalog: Record<string, CatalogEntry>;
  metricConfig: Record<string, GroupConfig>;
  divergencePairs: DivergencePair[];
  thresholds: ThresholdRow[];
  tunables: Tunables;
}

export interface ActiveWatch {
  target_type: 'metric_group' | 'pair';
  target_ref: string; // group name, or 'primary_key|secondary_key'
  boost: number;
}

// The derived trend metrics have no onchain_observations rows; their series are
// pivoted out of v_btc_trend by loadObservationBundle. v_btc_trend column → key.
export const TREND_KEY_BY_COLUMN: Record<string, string> = {
  ma_50d: 'ma_50d',
  ma_200d: 'ma_200d',
  ma_200w: 'ma_200w',
  mayer_multiple: 'mayer_multiple',
  ma_cross_spread_pct: 'ma_cross',
  rsi_14: 'rsi_14',
  realized_vol_30d: 'realized_vol_30d',
  drawdown_pct: 'drawdown_from_high',
};

export async function loadFindingConfig(): Promise<FindingConfig> {
  const [onchainRes, macroRes, groupRes, pairRes, thresholdRes] = await Promise.all([
    db
      .from('onchain_indicators')
      .select('id, key, short_label, metric_group, derivation')
      .eq('is_active', true),
    db
      .from('economic_indicators')
      .select('id, short_label, category, period_granularity')
      .eq('is_active', true),
    db.from('finding_metric_config').select('metric_group, thesis_weight, vol_class, allowed_vocab'),
    db
      .from('finding_divergence_pairs')
      .select('primary_key, secondary_key, expected_sign, corr_window_days, break_threshold')
      .eq('active', true),
    db
      .from('finding_thresholds')
      .select('metric_key, level_name, level_value, cross_direction, compliance_class')
      .eq('active', true),
  ]);

  for (const [name, res] of [
    ['onchain_indicators', onchainRes],
    ['economic_indicators', macroRes],
    ['finding_metric_config', groupRes],
    ['finding_divergence_pairs', pairRes],
    ['finding_thresholds', thresholdRes],
  ] as const) {
    if (res.error) throw new Error(`findings config: ${name} read failed: ${res.error.message}`);
  }

  const catalog: Record<string, CatalogEntry> = {};
  for (const row of onchainRes.data ?? []) {
    catalog[row.key] = {
      key: row.key,
      group: row.metric_group,
      label: row.short_label,
      source: row.derivation === 'derived' ? 'onchain_derived' : 'onchain',
      granularity: 'daily',
      indicatorId: row.id,
    };
  }
  for (const row of macroRes.data ?? []) {
    const key = macroMetricKey(row.short_label);
    catalog[key] = {
      key,
      group: row.category,
      label: row.short_label,
      source: 'macro',
      granularity: (row.period_granularity ?? 'monthly') as Granularity,
      indicatorId: row.id,
    };
  }

  const metricConfig: Record<string, GroupConfig> = {};
  for (const row of groupRes.data ?? []) {
    metricConfig[row.metric_group] = {
      thesis_weight: Number(row.thesis_weight),
      vol_class: row.vol_class,
      allowed_vocab: row.allowed_vocab ?? [],
    };
  }

  const divergencePairs: DivergencePair[] = [];
  for (const row of pairRes.data ?? []) {
    if (!catalog[row.primary_key] || !catalog[row.secondary_key]) {
      log.warn(
        { primary: row.primary_key, secondary: row.secondary_key },
        'divergence pair references unknown metric key — dropped',
      );
      continue;
    }
    divergencePairs.push({
      primary_key: row.primary_key,
      secondary_key: row.secondary_key,
      expected_sign: row.expected_sign,
      corr_window_days: Number(row.corr_window_days),
      break_threshold: Number(row.break_threshold),
    });
  }

  const thresholds: ThresholdRow[] = [];
  for (const row of thresholdRes.data ?? []) {
    if (!catalog[row.metric_key]) {
      log.warn({ metricKey: row.metric_key, level: row.level_name }, 'threshold references unknown metric key — dropped');
      continue;
    }
    thresholds.push({
      metric_key: row.metric_key,
      level_name: row.level_name,
      level_value: Number(row.level_value),
      cross_direction: row.cross_direction,
      compliance_class: row.compliance_class,
    });
  }

  return { catalog, metricConfig, divergencePairs, thresholds, tunables: DEFAULT_TUNABLES };
}

export async function loadActiveWatches(now: Date = new Date()): Promise<ActiveWatch[]> {
  const { data, error } = await db
    .from('finding_watch')
    .select('target_type, target_ref, boost, expires_at');
  if (error) {
    log.warn({ err: error }, 'finding_watch read failed — continuing without watches');
    return [];
  }
  const nowIso = now.toISOString();
  return (data ?? [])
    .filter((row: { expires_at: string | null }) => row.expires_at == null || row.expires_at > nowIso)
    .map((row: { target_type: 'metric_group' | 'pair'; target_ref: string; boost: number }) => ({
      target_type: row.target_type,
      target_ref: row.target_ref,
      boost: Number(row.boost),
    }));
}
