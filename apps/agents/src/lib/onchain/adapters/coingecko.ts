/**
 * CoinGecko adapter — free, keyless, JSON REST. Fetches Bitcoin's AUD spot price.
 *
 *   GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=aud
 *
 * Point-in-time only (one observation per poll, dated today) — mirrors
 * apps/web's BitcoinPriceAUD dashboard widget, which hits the same endpoint.
 *
 * See docs/features/onchain-indicators/adapter-contract.md.
 */

import type {
  AdapterError,
  AdapterResult,
  OnchainAdapter,
  OnchainIndicatorConfig,
} from '../types.js';
import { utcDate } from '../types.js';

const URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=aud';

interface SimplePriceResponse {
  bitcoin?: { aud?: number };
}

/** Pure parse step — exported for fixture tests (no network). */
export function parsePrice(payload: unknown): AdapterResult {
  const r = payload as SimplePriceResponse;
  const price = r.bitcoin?.aud;
  if (typeof price !== 'number' || Number.isNaN(price)) {
    return { ok: false, error: { kind: 'parse', message: 'coingecko simple/price missing bitcoin.aud' } };
  }
  return {
    ok: true,
    observations: [{ observedAt: utcDate(new Date()), key: 'btc_price_aud', value: price, raw: r }],
  };
}

export const coingeckoAdapter: OnchainAdapter = {
  provider: 'coingecko',

  async fetchLatest(_indicators: OnchainIndicatorConfig[]): Promise<AdapterResult> {
    let res: Response;
    try {
      res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind: AdapterError['kind'] = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `coingecko HTTP ${res.status}`, status: res.status } };
    }
    try {
      return parsePrice(await res.json());
    } catch (err) {
      return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'coingecko JSON parse failed' } };
    }
  },
};
