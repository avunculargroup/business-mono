import type {
  DashboardIndicators,
  IndicatorLatest,
  IndicatorsRepository,
  OnchainLatest,
  ReadContext,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

type MacroLatestRow = {
  indicator_id: string | null;
  name: string | null;
  short_label: string | null;
  category: string | null;
  region: string | null;
  unit: string | null;
  decimals: number | null;
  period_date: string | null;
  period_granularity: string | null;
  released_at: string | null;
  days_since_release: number | null;
  expected_next_release: string | null;
  typical_release_gap_days: number | null;
  current_value: number | null;
  prior_value: number | null;
  change_since_prior: number | null;
  pct_change_since_prior: number | null;
  year_ago_period: string | null;
  year_ago_value: number | null;
  yoy_change: number | null;
  yoy_pct_change: number | null;
  is_revision: boolean | null;
  superseded_value: number | null;
};

function toMacroLatest(row: MacroLatestRow): IndicatorLatest {
  return {
    indicatorId: row.indicator_id,
    name: row.name,
    shortLabel: row.short_label,
    category: row.category,
    region: row.region,
    unit: row.unit,
    decimals: row.decimals,
    periodDate: row.period_date,
    periodGranularity: row.period_granularity,
    releasedAt: row.released_at,
    daysSinceRelease: row.days_since_release,
    expectedNextRelease: row.expected_next_release,
    typicalReleaseGapDays: row.typical_release_gap_days,
    currentValue: row.current_value,
    priorValue: row.prior_value,
    // Signed, and that is all. No direction, no colour, no sentiment — see the
    // note on IndicatorLatest.
    changeSincePrior: row.change_since_prior,
    pctChangeSincePrior: row.pct_change_since_prior,
    yearAgoPeriod: row.year_ago_period,
    yearAgoValue: row.year_ago_value,
    yoyChange: row.yoy_change,
    yoyPctChange: row.yoy_pct_change,
    isRevision: row.is_revision,
    supersededValue: row.superseded_value,
  };
}

type OnchainLatestRow = {
  key: string | null;
  name: string | null;
  short_label: string | null;
  metric_group: string | null;
  unit: string | null;
  decimals: number | null;
  observed_at: string | null;
  days_since_observed: number | null;
  value: number | null;
  change_since_prior: number | null;
  pct_change_since_prior: number | null;
  signal: string | null;
};

function toOnchainLatest(row: OnchainLatestRow): OnchainLatest {
  return {
    key: row.key,
    name: row.name,
    shortLabel: row.short_label,
    metricGroup: row.metric_group,
    unit: row.unit,
    decimals: row.decimals,
    observedAt: row.observed_at,
    daysSinceObserved: row.days_since_observed,
    value: row.value,
    changeSincePrior: row.change_since_prior,
    pctChangeSincePrior: row.pct_change_since_prior,
    signal: row.signal,
  };
}

export function createIndicatorsRepository(
  adapter: SupabaseAdapterContext,
): IndicatorsRepository {
  const { client } = adapter;

  return {
    async getDashboard(_ctx: ReadContext): Promise<DashboardIndicators> {
      // Four independent reads for one block of the page. They went in parallel
      // when the page issued them and they still do.
      const [macroLatest, macroSeries, onchainLatest, onchainSeries] = await Promise.all([
        client.from('v_indicator_latest').select('*'),
        client.from('v_indicator_series').select('*'),
        client.from('v_onchain_dashboard').select('*'),
        client.from('v_onchain_series').select('*'),
      ]);

      const failure =
        macroLatest.error ?? macroSeries.error ?? onchainLatest.error ?? onchainSeries.error;
      if (failure) throw failure;

      return {
        macroLatest: ((macroLatest.data ?? []) as MacroLatestRow[]).map(toMacroLatest),
        macroSeries: ((macroSeries.data ?? []) as IndicatorSeriesRow[]).map((row) => ({
          indicatorId: row.indicator_id,
          shortLabel: row.short_label,
          periodDate: row.period_date,
          releasedAt: row.released_at,
          value: row.value,
        })),
        onchainLatest: ((onchainLatest.data ?? []) as OnchainLatestRow[]).map(toOnchainLatest),
        onchainSeries: ((onchainSeries.data ?? []) as OnchainSeriesRow[]).map((row) => ({
          indicatorId: row.indicator_id,
          key: row.key,
          shortLabel: row.short_label,
          observedAt: row.observed_at,
          value: row.value,
        })),
      };
    },
  };
}

type IndicatorSeriesRow = {
  indicator_id: string | null;
  short_label: string | null;
  period_date: string | null;
  released_at: string | null;
  value: number | null;
};

type OnchainSeriesRow = {
  indicator_id: string | null;
  key: string | null;
  short_label: string | null;
  observed_at: string | null;
  value: number | null;
};
