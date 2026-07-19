import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { FindingConfig } from './config.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const { loadObservationBundle, upsertMarketReport, markReportEmailed } = await import('./dataAccess.js');
const { DEFAULT_TUNABLES } = await import('./config.js');

const config: FindingConfig = {
  catalog: {
    hash_rate: { key: 'hash_rate', group: 'network_security', label: 'Hash rate', source: 'onchain', granularity: 'daily', indicatorId: 'oc-1' },
    // Derived trend metric — series comes from the v_btc_trend pivot.
    mayer_multiple: { key: 'mayer_multiple', group: 'trend_valuation', label: 'Mayer Multiple', source: 'onchain_derived', granularity: 'daily', indicatorId: 'oc-2' },
    // Hash-ribbons state series is loaded separately, never as a numeric metric.
    hash_ribbons: { key: 'hash_ribbons', group: 'network_security', label: 'Hash Ribbons', source: 'onchain_derived', granularity: 'daily', indicatorId: 'oc-3' },
    'macro:us_m2': { key: 'macro:us_m2', group: 'money_supply', label: 'US M2', source: 'macro', granularity: 'monthly', indicatorId: 'ec-1' },
  },
  metricConfig: {},
  divergencePairs: [],
  thresholds: [],
  tunables: DEFAULT_TUNABLES,
};

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  fakeSupabase.__setResponse('v_onchain_series', {
    data: [
      { observed_at: '2026-07-17', value: 100 },
      { observed_at: '2026-07-18', value: 92 },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('v_indicator_series', {
    data: [
      { period_date: '2026-05-01', value: 21000 },
      { period_date: '2026-06-01', value: 21200 },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('v_btc_trend', {
    data: [
      { observed_at: '2026-07-17', ma_50d: 1, ma_200d: 2, ma_200w: 3, mayer_multiple: 1.1, ma_cross_spread_pct: 0.5, rsi_14: 55, realized_vol_30d: 40, drawdown_pct: -10 },
      { observed_at: '2026-07-18', ma_50d: 1, ma_200d: 2, ma_200w: 3, mayer_multiple: 1.2, ma_cross_spread_pct: null, rsi_14: 56, realized_vol_30d: 41, drawdown_pct: -9 },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('v_hash_ribbons', {
    data: [
      { observed_at: '2026-07-17', spread_pct: 1.2, signal: 'neutral' },
      { observed_at: '2026-07-18', spread_pct: -0.4, signal: 'capitulation' },
    ],
    error: null,
  });
});

describe('loadObservationBundle', () => {
  it('assembles fetched, macro, and pivoted trend series under catalog keys', async () => {
    const bundle = await loadObservationBundle('2026-07-18', config);

    expect(bundle.asOf).toBe('2026-07-18');
    expect(bundle.series['hash_rate'].points).toEqual([
      { date: '2026-07-17', value: 100 },
      { date: '2026-07-18', value: 92 },
    ]);
    expect(bundle.series['hash_rate'].latestObservedAt).toBe('2026-07-18');
    expect(bundle.series['macro:us_m2'].granularity).toBe('monthly');
    expect(bundle.series['macro:us_m2'].points).toHaveLength(2);

    // Derived trend metric pivoted out of v_btc_trend, nulls skipped.
    expect(bundle.series['mayer_multiple'].points).toEqual([
      { date: '2026-07-17', value: 1.1 },
      { date: '2026-07-18', value: 1.2 },
    ]);

    // hash_ribbons is a state series, not a numeric metric series.
    expect(bundle.series['hash_ribbons']).toBeUndefined();
    expect(bundle.hashRibbons).toEqual([
      { date: '2026-07-17', spreadPct: 1.2, signal: 'neutral' },
      { date: '2026-07-18', spreadPct: -0.4, signal: 'capitulation' },
    ]);
  });

  it('throws when a series read fails', async () => {
    fakeSupabase.__setResponse('v_btc_trend', { data: null, error: { message: 'boom' } });
    await expect(loadObservationBundle('2026-07-18', config)).rejects.toThrow(/v_btc_trend/);
  });
});

describe('market_reports persistence', () => {
  it('upserts on as_of and returns the row id', async () => {
    fakeSupabase.__setResponse('market_reports', { data: { id: 'mr-1' }, error: null });
    const id = await upsertMarketReport({
      as_of: '2026-07-18',
      status: 'published',
      report_mode: 'normal',
      narration_markdown: 'The one move worth attention…',
      findings: [],
      ops_findings: [],
      lint_result: null,
      lex_result: null,
    });
    expect(id).toBe('mr-1');
    const builder = fakeSupabase.__buildersFor('market_reports')[0];
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ as_of: '2026-07-18', status: 'published', emailed: false }),
      { onConflict: 'as_of' },
    );
  });

  it('returns null (logged, not thrown) when the upsert fails', async () => {
    fakeSupabase.__setResponse('market_reports', { data: null, error: { message: 'rls' } });
    await expect(
      upsertMarketReport({
        as_of: '2026-07-18',
        status: 'error',
        report_mode: 'quiet',
        narration_markdown: null,
        findings: [],
        ops_findings: [],
        lint_result: null,
        lex_result: null,
      }),
    ).resolves.toBeNull();
  });

  it('markReportEmailed updates the flag', async () => {
    fakeSupabase.__setResponse('market_reports', { data: null, error: null });
    await markReportEmailed('mr-1');
    const builder = fakeSupabase.__buildersFor('market_reports')[0];
    expect(builder.update).toHaveBeenCalledWith({ emailed: true });
    expect(builder.eq).toHaveBeenCalledWith('id', 'mr-1');
  });
});
