/**
 * alternative.me adapter — free, keyless, JSON REST. Fetches the Crypto Fear &
 * Greed Index (0-100; market-wide sentiment, but the de facto Bitcoin gauge).
 *
 *   GET https://api.alternative.me/fng/?limit=1
 *
 * Point-in-time only — the index itself only updates once daily. Mirrors
 * apps/web's FearGreedIndicator dashboard widget, which hits the same endpoint.
 * The classification (e.g. "Greed") rides in `raw` for the report's signal chip.
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

const URL = 'https://api.alternative.me/fng/?limit=1';

interface FngEntry {
  value?: string;
  value_classification?: string;
}
interface FngResponse {
  data?: FngEntry[];
}

/** Pure parse step — exported for fixture tests (no network). */
export function parseFearGreed(payload: unknown): AdapterResult {
  const r = payload as FngResponse;
  const entry = r.data?.[0];
  const value = Number(entry?.value);
  if (!entry || Number.isNaN(value)) {
    return { ok: false, error: { kind: 'parse', message: 'alternative.me fng response missing data[0].value' } };
  }
  return {
    ok: true,
    observations: [{
      observedAt: utcDate(new Date()),
      key: 'fear_greed',
      value,
      raw: { classification: entry.value_classification ?? 'Unknown' },
    }],
  };
}

export const alternativeMeAdapter: OnchainAdapter = {
  provider: 'alternative_me',

  async fetchLatest(_indicators: OnchainIndicatorConfig[]): Promise<AdapterResult> {
    let res: Response;
    try {
      res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind: AdapterError['kind'] = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `alternative.me HTTP ${res.status}`, status: res.status } };
    }
    try {
      return parseFearGreed(await res.json());
    } catch (err) {
      return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'alternative.me JSON parse failed' } };
    }
  },
};
