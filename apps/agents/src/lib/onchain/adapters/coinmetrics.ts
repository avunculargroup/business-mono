/**
 * Coin Metrics community adapter — free, keyless, JSON REST.
 * Base https://api.coinmetrics.io/v4. BATCHES every metric into one request:
 *
 *   GET /timeseries/asset-metrics
 *       ?assets=btc&metrics=CapMVRVCur,CapRealUSD,SplyCur,AdrActCnt
 *       &frequency=1d&page_size=N
 *
 * Each data row is one day carrying all requested metrics. We map each metric
 * code back to its registry key via the indicator configs. Values arrive as
 * strings — parseFloat, and treat a missing/empty metric as absent for that key
 * (NOT a zero). The community tier is ~1.6 req/s; one daily batched call is
 * trivially within budget.
 *
 * MVRV is fetched directly here (CapMVRVCur) — it is NOT derived. realised_cap
 * and supply are raw inputs the view divides into realised_price.
 *
 * See docs/features/onchain-indicators/adapter-contract.md.
 */

import type {
  AdapterError,
  AdapterResult,
  FetchOptions,
  OnchainAdapter,
  OnchainIndicatorConfig,
  RawObservation,
} from '../types.js';
import { utcDate } from '../types.js';

const BASE = 'https://api.coinmetrics.io/v4';

interface CmRow {
  asset?: string;
  time?: string;
  [metric: string]: unknown;
}

/** Pure parse step — exported for fixture tests (no network). `byCode` maps a
 *  provider metric code (e.g. 'CapRealUSD') to its registry key. */
export function parseCoinMetricsResponse(
  payload: unknown,
  byCode: Map<string, string>,
): AdapterResult {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return { ok: false, error: { kind: 'parse', message: 'Coin Metrics response missing data array' } };
  }

  const out: RawObservation[] = [];
  for (const row of data as CmRow[]) {
    if (!row.time) {
      return { ok: false, error: { kind: 'parse', message: 'Coin Metrics row missing time' } };
    }
    const observedAt = utcDate(new Date(row.time));
    for (const [code, key] of byCode) {
      const raw = row[code];
      if (raw == null || raw === '') continue; // missing metric for this day — absent, not zero
      const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      if (Number.isNaN(value)) {
        return { ok: false, error: { kind: 'parse', message: `Coin Metrics non-numeric ${code}="${String(raw)}" for ${observedAt}` } };
      }
      out.push({ observedAt, key, value, raw: { time: row.time, [code]: raw } });
    }
  }

  out.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return { ok: true, observations: out };
}

export const coinmetricsAdapter: OnchainAdapter = {
  provider: 'coinmetrics',

  async fetchLatest(indicators: OnchainIndicatorConfig[], opts?: FetchOptions): Promise<AdapterResult> {
    const byCode = new Map<string, string>();
    for (const i of indicators) {
      if (i.providerMetricCode) byCode.set(i.providerMetricCode, i.key);
    }
    if (byCode.size === 0) {
      return { ok: false, error: { kind: 'not_found', message: 'No Coin Metrics metric codes to fetch' } };
    }

    const url = new URL(`${BASE}/timeseries/asset-metrics`);
    url.searchParams.set('assets', 'btc');
    url.searchParams.set('metrics', [...byCode.keys()].join(','));
    url.searchParams.set('frequency', '1d');
    url.searchParams.set('page_size', String(opts?.backfillDays ?? 2));
    // Newest-first so a steady run's small page is the most recent days.
    url.searchParams.set('sort', 'time');

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      const error: AdapterError = { kind: 'transport', message: err instanceof Error ? err.message : String(err) };
      return { ok: false, error };
    }
    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `Coin Metrics HTTP ${res.status}`, status: res.status } };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'Coin Metrics JSON parse failed' } };
    }

    return parseCoinMetricsResponse(payload, byCode);
  },
};
