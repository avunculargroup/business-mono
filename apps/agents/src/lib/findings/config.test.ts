import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const { loadFindingConfig, loadActiveWatches } = await import('./config.js');

function wireCatalog() {
  fakeSupabase.__setResponse('onchain_indicators', {
    data: [
      { id: 'oc-1', key: 'hash_rate', short_label: 'Hash rate', metric_group: 'network_security', derivation: 'fetched' },
      { id: 'oc-2', key: 'mvrv', short_label: 'MVRV', metric_group: 'behaviour_valuation', derivation: 'derived' },
      { id: 'oc-3', key: 'btc_price_usd', short_label: 'BTC/USD', metric_group: 'trend_valuation', derivation: 'fetched' },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('economic_indicators', {
    data: [
      { id: 'ec-1', short_label: 'US M2', category: 'money_supply', period_granularity: 'monthly' },
      { id: 'ec-2', short_label: 'S&P 500', category: 'equity', period_granularity: 'daily' },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('finding_metric_config', {
    data: [
      { metric_group: 'network_security', thesis_weight: '1.10', vol_class: 'high', allowed_vocab: ['hash rate'] },
      { metric_group: 'money_supply', thesis_weight: '1.40', vol_class: 'low', allowed_vocab: ['liquidity'] },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('finding_divergence_pairs', {
    data: [
      {
        primary_key: 'btc_price_usd',
        secondary_key: 'macro:us_m2',
        expected_sign: 'positive',
        corr_window_days: 540,
        break_threshold: '0.30',
      },
      {
        primary_key: 'btc_price_usd',
        secondary_key: 'macro:gold', // not in catalog — must be dropped
        expected_sign: 'positive',
        corr_window_days: 90,
        break_threshold: '0.30',
      },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('finding_thresholds', {
    data: [
      { metric_key: 'mvrv', level_name: 'MVRV 1.0', level_value: '1.0', cross_direction: 'either', compliance_class: 'valuation_sensitive' },
      { metric_key: 'mayer_multiple', level_name: 'Mayer 1.0', level_value: '1.0', cross_direction: 'either', compliance_class: 'valuation_sensitive' }, // unknown key — dropped
    ],
    error: null,
  });
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  wireCatalog();
});

describe('loadFindingConfig', () => {
  it('unifies both catalogs under one key namespace', async () => {
    const config = await loadFindingConfig();
    expect(config.catalog['hash_rate']).toMatchObject({ group: 'network_security', granularity: 'daily', source: 'onchain' });
    expect(config.catalog['mvrv'].source).toBe('onchain_derived');
    expect(config.catalog['macro:us_m2']).toMatchObject({ group: 'money_supply', granularity: 'monthly', source: 'macro', indicatorId: 'ec-1' });
    expect(config.catalog['macro:s_p_500'].granularity).toBe('daily');
  });

  it('parses numeric seed columns', async () => {
    const config = await loadFindingConfig();
    expect(config.metricConfig['money_supply'].thesis_weight).toBe(1.4);
    expect(config.divergencePairs[0].break_threshold).toBe(0.3);
    expect(config.thresholds[0].level_value).toBe(1);
  });

  it('drops seeded rows whose metric keys are not in the catalog', async () => {
    const config = await loadFindingConfig();
    expect(config.divergencePairs).toHaveLength(1);
    expect(config.divergencePairs[0].secondary_key).toBe('macro:us_m2');
    expect(config.thresholds).toHaveLength(1);
    expect(config.thresholds[0].metric_key).toBe('mvrv');
  });

  it('throws when a catalog read fails', async () => {
    fakeSupabase.__setResponse('onchain_indicators', { data: null, error: { message: 'boom' } });
    await expect(loadFindingConfig()).rejects.toThrow(/onchain_indicators/);
  });
});

describe('loadActiveWatches', () => {
  it('filters expired watches and keeps open-ended ones', async () => {
    fakeSupabase.__setResponse('finding_watch', {
      data: [
        { target_type: 'metric_group', target_ref: 'money_supply', boost: '1.50', expires_at: null },
        { target_type: 'pair', target_ref: 'btc_price_usd|macro:us_m2', boost: '2.00', expires_at: '2099-01-01T00:00:00Z' },
        { target_type: 'metric_group', target_ref: 'fx', boost: '1.50', expires_at: '2020-01-01T00:00:00Z' },
      ],
      error: null,
    });
    const watches = await loadActiveWatches(new Date('2026-07-19T00:00:00Z'));
    expect(watches).toHaveLength(2);
    expect(watches[1].boost).toBe(2);
  });

  it('returns [] on read error', async () => {
    fakeSupabase.__setResponse('finding_watch', { data: null, error: { message: 'nope' } });
    await expect(loadActiveWatches()).resolves.toEqual([]);
  });
});
