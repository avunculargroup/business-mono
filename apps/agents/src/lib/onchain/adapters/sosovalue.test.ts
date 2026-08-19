import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { parseFlowHistory, parseCurrentMetrics, sosovalueAdapter } from './sosovalue.js';
import type { OnchainIndicatorConfig } from '../types.js';

const flowConfig: OnchainIndicatorConfig = {
  key: 'etf_net_flow',
  provider: 'sosovalue',
  providerMetricCode: 'us-btc-spot.totalNetInflow',
  unit: 'usd_million',
};

const assetsConfig: OnchainIndicatorConfig = {
  key: 'etf_net_assets',
  provider: 'sosovalue',
  providerMetricCode: 'us-btc-spot.totalNetAssets',
  unit: 'usd_billion',
};

describe('parseFlowHistory', () => {
  it('scales raw USD to the indicator unit (millions), oldest→newest', () => {
    const payload = {
      code: 0,
      data: [
        { date: '2026-08-07', totalNetInflow: 98850000 },
        { date: '2026-08-06', totalNetInflow: '211430000' },
      ],
    };
    const res = parseFlowHistory(payload, flowConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(2);
    expect(res.observations[0]).toMatchObject({ observedAt: '2026-08-06', key: 'etf_net_flow', value: 211.43 });
    expect(res.observations[1]).toMatchObject({ observedAt: '2026-08-07', value: 98.85 });
  });

  it('keeps an outflow session negative', () => {
    const res = parseFlowHistory({ data: [{ date: '2026-08-05', totalNetInflow: -196540000 }] }, flowConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0].value).toBeCloseTo(-196.54, 6);
  });

  it('treats a session with no flow figure as absent, NOT a zero', () => {
    const res = parseFlowHistory({ data: [{ date: '2026-08-07', totalNetInflow: '' }, { date: '2026-08-06' }] }, flowConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(0);
  });

  it('accepts a bare array (no envelope)', () => {
    const res = parseFlowHistory([{ date: '2026-08-07', totalNetInflow: 98850000 }], flowConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
  });

  it('surfaces a non-zero envelope code as an error, never as data', () => {
    const res = parseFlowHistory({ code: 40001, msg: 'invalid api key', data: null }, flowConfig);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('transport');
    expect(res.error.message).toContain('invalid api key');
  });

  it('parse error (with the body attached) when data is not an array', () => {
    const res = parseFlowHistory({ code: 0, data: { oops: true } }, flowConfig);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('expected an array');
  });

  it('parse error when a row carries no usable date', () => {
    const res = parseFlowHistory({ data: [{ totalNetInflow: 98850000 }] }, flowConfig);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('date');
  });
});

describe('parseCurrentMetrics', () => {
  it('scales raw USD to billions and dates the level by the payload as-at date', () => {
    const payload = { code: 0, data: { totalNetAssets: '150420000000', lastUpdateDate: '2026-08-07' } };
    const res = parseCurrentMetrics(payload, assetsConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toEqual([
      {
        observedAt: '2026-08-07',
        key: 'etf_net_assets',
        value: 150.42,
        raw: { totalNetAssets: '150420000000', lastUpdateDate: '2026-08-07' },
      },
    ]);
  });

  it('falls back to today when the payload carries no date', () => {
    const res = parseCurrentMetrics({ data: { totalNetAssets: 150420000000 } }, assetsConfig);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations[0].observedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it('parse error when totalNetAssets is absent', () => {
    const res = parseCurrentMetrics({ data: { somethingElse: 1 } }, assetsConfig);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
    expect(res.error.message).toContain('totalNetAssets');
  });
});

describe('sosovalueAdapter.fetchLatest', () => {
  beforeEach(() => {
    process.env['SOSOVALUE_API_KEY'] = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['SOSOVALUE_API_KEY'];
  });

  function stubEndpoints(bodies: Record<string, { status?: number; body: unknown }>) {
    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      const endpoint = url.slice(url.lastIndexOf('/') + 1);
      expect((init?.headers as Record<string, string>)['x-soso-api-key']).toBe('test-key');
      expect(JSON.parse(String(init?.body))).toEqual({ type: 'us-btc-spot' });
      const match = bodies[endpoint];
      if (!match) throw new Error(`unexpected endpoint ${endpoint}`);
      return new Response(JSON.stringify(match.body), { status: match.status ?? 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('polls both endpoints and returns both series', async () => {
    stubEndpoints({
      historicalInflowChart: { body: { code: 0, data: [{ date: '2026-08-07', totalNetInflow: 98850000 }] } },
      currentEtfDataMetrics: { body: { code: 0, data: { totalNetAssets: 150420000000, lastUpdateDate: '2026-08-07' } } },
    });

    const res = await sosovalueAdapter.fetchLatest([flowConfig, assetsConfig]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => [o.key, o.value])).toEqual([
      ['etf_net_flow', 98.85],
      ['etf_net_assets', 150.42],
    ]);
  });

  it('only calls the endpoint whose indicator was requested', async () => {
    const fetchMock = stubEndpoints({
      historicalInflowChart: { body: { code: 0, data: [{ date: '2026-08-07', totalNetInflow: 98850000 }] } },
    });

    const res = await sosovalueAdapter.fetchLatest([flowConfig]);
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the healthy series when one endpoint fails', async () => {
    stubEndpoints({
      historicalInflowChart: { body: { code: 0, data: [{ date: '2026-08-07', totalNetInflow: 98850000 }] } },
      currentEtfDataMetrics: { status: 500, body: 'boom' },
    });

    const res = await sosovalueAdapter.fetchLatest([flowConfig, assetsConfig]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => o.key)).toEqual(['etf_net_flow']);
  });

  it('fails when every endpoint fails', async () => {
    stubEndpoints({
      historicalInflowChart: { status: 429, body: 'slow down' },
      currentEtfDataMetrics: { status: 429, body: 'slow down' },
    });

    const res = await sosovalueAdapter.fetchLatest([flowConfig, assetsConfig]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('rate_limit');
  });

  it('fails (not silently) when SOSOVALUE_API_KEY is not set', async () => {
    delete process.env['SOSOVALUE_API_KEY'];
    const res = await sosovalueAdapter.fetchLatest([flowConfig]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('SOSOVALUE_API_KEY');
  });

  it('fails when called with no ETF indicators', async () => {
    const res = await sosovalueAdapter.fetchLatest([]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not_found');
  });
});
