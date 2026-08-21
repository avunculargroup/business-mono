import { beforeEach, describe, expect, it } from 'vitest';
import { testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function indicators() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .indicators;
}

const macroRow = {
  indicator_id: 'i1',
  name: 'CPI',
  short_label: 'CPI',
  category: 'inflation',
  region: 'AU',
  unit: '%',
  decimals: 1,
  period_date: '2026-06-30',
  period_granularity: 'quarterly',
  released_at: '2026-07-30',
  days_since_release: 3,
  expected_next_release: '2026-10-29',
  typical_release_gap_days: 91,
  current_value: 3.2,
  prior_value: 3.6,
  change_since_prior: -0.4,
  pct_change_since_prior: -11.1,
  year_ago_period: '2025-06-30',
  year_ago_value: 4.1,
  yoy_change: -0.9,
  yoy_pct_change: -21.9,
  is_revision: false,
  superseded_value: null,
};

const onchainRow = {
  key: 'hash_rate',
  name: 'Hash rate',
  short_label: 'Hash',
  metric_group: 'network',
  unit: 'EH/s',
  decimals: 0,
  observed_at: '2026-07-18',
  days_since_observed: 1,
  value: 720,
  change_since_prior: -62,
  pct_change_since_prior: -7.9,
  signal: 'capitulation',
};

beforeEach(() => {
  client = createFakeSupabase();
  client.__setResponse('v_indicator_latest', { data: [macroRow], error: null });
  client.__setResponse('v_indicator_series', {
    data: [
      {
        indicator_id: 'i1',
        short_label: 'CPI',
        period_date: '2026-03-31',
        released_at: '2026-04-30',
        value: 3.6,
      },
    ],
    error: null,
  });
  client.__setResponse('v_onchain_dashboard', { data: [onchainRow], error: null });
  client.__setResponse('v_onchain_series', {
    data: [
      {
        indicator_id: 'i9',
        key: 'hash_rate',
        short_label: 'Hash',
        observed_at: '2026-07-17',
        value: 782,
      },
    ],
    error: null,
  });
});

describe('getDashboard', () => {
  it('camel-cases every column of the macro view', async () => {
    const { macroLatest } = await indicators().getDashboard(ctx);

    expect(macroLatest[0]).toEqual({
      indicatorId: 'i1',
      name: 'CPI',
      shortLabel: 'CPI',
      category: 'inflation',
      region: 'AU',
      unit: '%',
      decimals: 1,
      periodDate: '2026-06-30',
      periodGranularity: 'quarterly',
      releasedAt: '2026-07-30',
      daysSinceRelease: 3,
      expectedNextRelease: '2026-10-29',
      typicalReleaseGapDays: 91,
      currentValue: 3.2,
      priorValue: 3.6,
      changeSincePrior: -0.4,
      pctChangeSincePrior: -11.1,
      yearAgoPeriod: '2025-06-30',
      yearAgoValue: 4.1,
      yoyChange: -0.9,
      yoyPctChange: -21.9,
      isRevision: false,
      supersededValue: null,
    });
  });

  it('returns deltas as signed numbers and nothing more', async () => {
    // The compliance rule this surface exists to hold: no direction, no colour,
    // no sentiment in the data layer. An AR must not imply a recommendation,
    // and "green up, red down" is that implication. Turning a sign into an
    // arrow is presentation and stays in lib/indicators/format.ts.
    const { macroLatest, onchainLatest } = await indicators().getDashboard(ctx);

    expect(macroLatest[0].changeSincePrior).toBe(-0.4);
    for (const forbidden of ['direction', 'kind', 'colour', 'color', 'sentiment', 'trend']) {
      expect(macroLatest[0]).not.toHaveProperty(forbidden);
      expect(onchainLatest[0]).not.toHaveProperty(forbidden);
    }
  });

  it('carries the on-chain signal through as a bare state', async () => {
    // `signal` says what the relationship is, never what to do about it, so it
    // travels as the stored string rather than as anything interpreted.
    const { onchainLatest } = await indicators().getDashboard(ctx);

    expect(onchainLatest[0]).toMatchObject({
      key: 'hash_rate',
      metricGroup: 'network',
      observedAt: '2026-07-18',
      changeSincePrior: -62,
      signal: 'capitulation',
    });
  });

  it('camel-cases both series', async () => {
    const { macroSeries, onchainSeries } = await indicators().getDashboard(ctx);

    expect(macroSeries[0]).toEqual({
      indicatorId: 'i1',
      shortLabel: 'CPI',
      periodDate: '2026-03-31',
      releasedAt: '2026-04-30',
      value: 3.6,
    });
    expect(onchainSeries[0]).toEqual({
      indicatorId: 'i9',
      key: 'hash_rate',
      shortLabel: 'Hash',
      observedAt: '2026-07-17',
      value: 782,
    });
  });

  it('reads the four views in one pass', async () => {
    await indicators().getDashboard(ctx);

    for (const view of [
      'v_indicator_latest',
      'v_indicator_series',
      'v_onchain_dashboard',
      'v_onchain_series',
    ]) {
      expect(client.__buildersFor(view)).toHaveLength(1);
    }
  });

  it('throws when any one of the four fails', async () => {
    // A dashboard missing its on-chain block silently would read as "nothing
    // happened on chain", which is a different claim from "we could not load it".
    client.__setResponse('v_onchain_dashboard', { data: null, error: { message: 'boom' } });

    await expect(indicators().getDashboard(ctx)).rejects.toMatchObject({ message: 'boom' });
  });

  it('reads empty views as empty blocks', async () => {
    for (const view of [
      'v_indicator_latest',
      'v_indicator_series',
      'v_onchain_dashboard',
      'v_onchain_series',
    ]) {
      client.__setResponse(view, { data: [], error: null });
    }

    expect(await indicators().getDashboard(ctx)).toEqual({
      macroLatest: [],
      macroSeries: [],
      onchainLatest: [],
      onchainSeries: [],
    });
  });
});
