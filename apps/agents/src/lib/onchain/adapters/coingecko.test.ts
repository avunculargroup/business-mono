import { describe, it, expect } from 'vitest';
import { parsePrice } from './coingecko.js';

describe('parsePrice', () => {
  it('emits btc_price_aud from bitcoin.aud', () => {
    const res = parsePrice({ bitcoin: { aud: 142350.12 } }, ['btc_price_aud']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'btc_price_aud', value: 142350.12 });
    expect(res.observations[0].observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('emits btc_price_usd from bitcoin.usd', () => {
    const res = parsePrice({ bitcoin: { usd: 64000 } }, ['btc_price_usd']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'btc_price_usd', value: 64000 });
  });

  it('emits one observation per requested key when both are asked for', () => {
    const res = parsePrice({ bitcoin: { aud: 142350, usd: 94000 } }, ['btc_price_aud', 'btc_price_usd']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations.map((o) => o.key)).toEqual(['btc_price_aud', 'btc_price_usd']);
    expect(res.observations.map((o) => o.value)).toEqual([142350, 94000]);
  });

  it('parse error when the requested currency is missing', () => {
    const res = parsePrice({ bitcoin: {} }, ['btc_price_aud']);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('parse error on a non-numeric price', () => {
    const res = parsePrice({ bitcoin: { aud: Number.NaN } }, ['btc_price_aud']);
    expect(res.ok).toBe(false);
  });
});
