/**
 * CoinGecko adapter — free, keyless, JSON REST. Fetches Bitcoin's spot price in
 * whichever currencies the requested indicators ask for (AUD and/or USD).
 *
 *   GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=aud,usd
 *
 * Point-in-time only (one observation per requested key per poll, dated today) —
 * mirrors apps/web's BitcoinPrice* dashboard cards, which hit the same endpoint.
 *
 * Emission is driven by the requested indicator KEYS, not by the response: the
 * onchain poll only ever asks CoinGecko for btc_price_aud (btc_price_usd's
 * canonical source is Coin Metrics), so no single provider double-writes the USD
 * series. The market_report routine reuses this adapter to live-fetch
 * btc_price_usd for its Bitcoin snapshot section.
 *
 * See docs/features/onchain-indicators/adapter-contract.md.
 */

import type {
  AdapterError,
  AdapterResult,
  OnchainAdapter,
  OnchainIndicatorConfig,
  RawObservation,
} from '../types.js';
import { utcDate } from '../types.js';

type Vs = 'aud' | 'usd';

/** The vs_currency each indicator key resolves to. */
const KEY_CURRENCY: Record<string, Vs> = {
  btc_price_aud: 'aud',
  btc_price_usd: 'usd',
};

const BASE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=';

interface SimplePriceResponse {
  bitcoin?: Partial<Record<Vs, number>>;
}

/** The keys this adapter knows, taken from the requested configs. Defaults to
 *  btc_price_aud when called with none (defensive — the poll always passes its
 *  configs; this keeps a bare call working). */
function requestedKeys(indicators: OnchainIndicatorConfig[]): string[] {
  const keys = indicators.map((i) => i.key).filter((k) => k in KEY_CURRENCY);
  return keys.length ? keys : ['btc_price_aud'];
}

/** Pure parse step — exported for fixture tests (no network). Emits one
 *  observation per requested key, reading the matching currency off the payload. */
export function parsePrice(payload: unknown, keys: string[]): AdapterResult {
  const r = payload as SimplePriceResponse;
  const observedAt = utcDate(new Date());
  const observations: RawObservation[] = [];
  for (const key of keys) {
    const cur = KEY_CURRENCY[key];
    if (!cur) continue; // unknown key — nothing to read for it
    const price = r.bitcoin?.[cur];
    if (typeof price !== 'number' || Number.isNaN(price)) {
      return { ok: false, error: { kind: 'parse', message: `coingecko simple/price missing bitcoin.${cur}` } };
    }
    observations.push({ observedAt, key, value: price, raw: r });
  }
  return { ok: true, observations };
}

export const coingeckoAdapter: OnchainAdapter = {
  provider: 'coingecko',

  async fetchLatest(indicators: OnchainIndicatorConfig[]): Promise<AdapterResult> {
    const keys = requestedKeys(indicators);
    const currencies = [...new Set(keys.map((k) => KEY_CURRENCY[k]))];
    let res: Response;
    try {
      res = await fetch(BASE_URL + currencies.join(','), { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind: AdapterError['kind'] = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `coingecko HTTP ${res.status}`, status: res.status } };
    }
    try {
      return parsePrice(await res.json(), keys);
    } catch (err) {
      return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'coingecko JSON parse failed' } };
    }
  },
};
