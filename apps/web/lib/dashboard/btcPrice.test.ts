import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

// createClient is async in the server module; hand it our fake. `fake` is
// reassigned per-test and only dereferenced when getBtcPrice() falls back to the
// cache, so the hoisted factory closing over it is safe.
let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Imported after the mock above is registered (vi.mock is hoisted).
import { getBtcPrice } from './btcPrice';

beforeEach(() => {
  fake = createFakeSupabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getBtcPrice', () => {
  it('returns the live CoinGecko price and 24h change', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bitcoin: { aud: 105000, aud_24h_change: 1.23 } }),
      }),
    );

    const result = await getBtcPrice('aud');

    expect(result).toEqual({ source: 'live', price: 105000, change24h: 1.23 });
    // Live path never touches the cache.
    expect(fake.__buildersFor('v_onchain_series')).toHaveLength(0);
  });

  it('returns a live price with null change when the change field is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bitcoin: { usd: 98000 } }) }),
    );

    expect(await getBtcPrice('usd')).toEqual({ source: 'live', price: 98000, change24h: null });
  });

  it('falls back to the last-known stored price when CoinGecko returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    fake.__setResponse('v_onchain_series', {
      data: { value: 102345, observed_at: '2026-07-18' },
      error: null,
    });

    const result = await getBtcPrice('aud');

    expect(result).toEqual({ source: 'cache', price: 102345, observedAt: '2026-07-18' });
    // It queried the AUD series.
    const [builder] = fake.__buildersFor('v_onchain_series');
    expect(builder.eq).toHaveBeenCalledWith('key', 'btc_price_aud');
  });

  it('falls back to the stored price when the live fetch throws (e.g. timeout abort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('The operation was aborted')));
    fake.__setResponse('v_onchain_series', {
      data: { value: 96000, observed_at: '2026-07-17' },
      error: null,
    });

    expect(await getBtcPrice('usd')).toEqual({ source: 'cache', price: 96000, observedAt: '2026-07-17' });
  });

  it('reads the USD series (Coin Metrics) for the USD fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    fake.__setResponse('v_onchain_series', {
      data: { value: 94000, observed_at: '2026-07-18' },
      error: null,
    });

    await getBtcPrice('usd');

    const [builder] = fake.__buildersFor('v_onchain_series');
    expect(builder.eq).toHaveBeenCalledWith('key', 'btc_price_usd');
  });

  it('returns null when both the live call and the cache are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    fake.__setResponse('v_onchain_series', { data: null, error: null });

    expect(await getBtcPrice('aud')).toBeNull();
  });

  it('treats a cache lookup error as no fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    fake.__setResponse('v_onchain_series', { data: null, error: { message: 'boom' } });

    expect(await getBtcPrice('usd')).toBeNull();
  });
});
