import { describe, it, expect } from 'vitest';
import { parsePrice } from './coingecko.js';

describe('parsePrice', () => {
  it('emits btc_price_aud from bitcoin.aud', () => {
    const res = parsePrice({ bitcoin: { aud: 142350.12 } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.observations).toHaveLength(1);
    expect(res.observations[0]).toMatchObject({ key: 'btc_price_aud', value: 142350.12 });
    expect(res.observations[0].observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parse error when bitcoin.aud is missing', () => {
    const res = parsePrice({ bitcoin: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('parse');
  });

  it('parse error on a non-numeric price', () => {
    const res = parsePrice({ bitcoin: { aud: Number.NaN } });
    expect(res.ok).toBe(false);
  });
});
