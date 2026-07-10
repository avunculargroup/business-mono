import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCoinMetricsResponse, buildAssetMetricsUrl, coinmetricsAdapter } from './coinmetrics.js';
import type { OnchainIndicatorConfig } from '../types.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'));
}

const byCode = new Map<string, string>([
  ['CapMVRVCur', 'mvrv'],
  ['CapRealUSD', 'realised_cap'],
  ['SplyCur', 'supply'],
  ['AdrActCnt', 'active_addresses'],
]);

describe('parseCoinMetricsResponse', () => {
  it('maps each metric code to its registry key, oldest→newest, across days', () => {
    const res = parseCoinMetricsResponse(fixture('coinmetrics-batch.json'), byCode);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 2 days × 4 metrics
    expect(res.observations).toHaveLength(8);

    const latestMvrv = res.observations.filter((o) => o.key === 'mvrv').at(-1);
    expect(latestMvrv).toMatchObject({ observedAt: '2026-06-20', value: 2.1 });

    const latestSupply = res.observations.filter((o) => o.key === 'supply').at(-1);
    expect(latestSupply?.value).toBe(19800000);
  });

  it('treats a missing/empty metric as absent for that key (NOT a zero)', () => {
    const payload = {
      data: [
        { asset: 'btc', time: '2026-06-20T00:00:00Z', CapMVRVCur: '2.10', CapRealUSD: '', SplyCur: '19800000' },
      ],
    };
    const res = parseCoinMetricsResponse(payload, byCode);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const keys = res.observations.map((o) => o.key);
    expect(keys).toContain('mvrv');
    expect(keys).toContain('supply');
    expect(keys).not.toContain('realised_cap'); // empty string → omitted, not 0
    expect(keys).not.toContain('active_addresses'); // missing field → omitted
  });

  it('parse error (not NaN, not a throw) on a non-numeric value', () => {
    const payload = { data: [{ asset: 'btc', time: '2026-06-20T00:00:00Z', CapMVRVCur: 'n/a' }] };
    const res = parseCoinMetricsResponse(payload, byCode);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('parse error when the data array is missing', () => {
    const res = parseCoinMetricsResponse({}, byCode);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });
});

describe('buildAssetMetricsUrl', () => {
  const codes = new Map<string, string>([['PriceUSD', 'btc_price_usd']]);
  const now = new Date('2026-07-08T09:00:00Z');

  it('targets the keyless community host (the bare api host answers 401 keyless)', () => {
    const url = buildAssetMetricsUrl(codes, undefined, now);
    expect(url.origin).toBe('https://community-api.coinmetrics.io');
  });

  it('anchors a rolling window off now via start_time (not the oldest page)', () => {
    // Steady poll: last STEADY_WINDOW_DAYS (3) days ending today.
    const url = buildAssetMetricsUrl(codes, undefined, now);
    expect(url.searchParams.get('sort')).toBe('time');
    expect(url.searchParams.get('start_time')).toBe('2026-07-06'); // now − 2 days
    expect(url.searchParams.get('page_size')).toBe('4');           // window + 1, one page
    expect(url.searchParams.get('metrics')).toBe('PriceUSD');
  });

  it('backfill widens the window to backfillDays and keeps page_size ≥ window', () => {
    const url = buildAssetMetricsUrl(codes, { backfillDays: 2600 }, now);
    expect(url.searchParams.get('start_time')).toBe('2019-05-27'); // now − 2599 days
    expect(url.searchParams.get('page_size')).toBe('2601');
  });
});

describe('coinmetricsAdapter.fetchLatest — community-tier 403 fallback', () => {
  const indicators: OnchainIndicatorConfig[] = [
    { key: 'mvrv', provider: 'coinmetrics', providerMetricCode: 'CapMVRVCur', unit: 'ratio' },
    { key: 'btc_price_usd', provider: 'coinmetrics', providerMetricCode: 'PriceUSD', unit: 'usd' },
  ];

  afterEach(() => vi.unstubAllGlobals());

  // CM answers 403 to the batched request (a Pro-gated metric is in the set), then
  // 403 for CapMVRVCur alone and 200 for PriceUSD alone.
  function stubFetch() {
    return vi.fn(async (input: URL | string) => {
      const metrics = new URL(input).searchParams.get('metrics') ?? '';
      const isSingle = !metrics.includes(',');
      if (!isSingle) return new Response('forbidden', { status: 403 });
      if (metrics === 'PriceUSD') {
        return new Response(
          JSON.stringify({ data: [{ asset: 'btc', time: '2026-07-08T00:00:00Z', PriceUSD: '64000' }] }),
          { status: 200 },
        );
      }
      return new Response('forbidden', { status: 403 }); // CapMVRVCur — not community
    });
  }

  it('drops the forbidden metric but still ingests the entitled one', async () => {
    vi.stubGlobal('fetch', stubFetch());
    const res = await coinmetricsAdapter.fetchLatest(indicators);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const keys = res.observations.map((o) => o.key);
    expect(keys).toContain('btc_price_usd'); // entitled → ingested
    expect(keys).not.toContain('mvrv');       // forbidden → dropped, not fatal
    expect(res.observations.find((o) => o.key === 'btc_price_usd')?.value).toBe(64000);
  });

  it('surfaces the 403 only when no metric is entitled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    const res = await coinmetricsAdapter.fetchLatest(indicators);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.status).toBe(403);
  });
});
