/**
 * FRED adapter — the easy one. JSON, one request, well-behaved.
 *
 * GET https://api.stlouisfed.org/fred/series/observations
 *   ?series_id={providerSeriesCode}&api_key=...&file_type=json
 *   &sort_order=desc&limit={n}
 *
 * Values arrive as strings; missing values are the literal ".". The most-recent
 * row can legitimately be "." (not yet published) — we filter those out and keep
 * the real values. releasedAt is null in v1 (ALFRED realtime dates are a later
 * upgrade that slots in here with no contract change).
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type {
  AdapterResult,
  FetchOptions,
  IndicatorConfig,
  ProviderAdapter,
  RawObservation,
} from '../types.js';
import { toFirstOfMonthISO } from '../period.js';

const FRED_ENDPOINT = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;
  value: string;
  realtime_start?: string;
  realtime_end?: string;
}

/** Pure parse step — exported for fixture tests (no network). */
export function parseFredResponse(payload: unknown): AdapterResult {
  const observations = (payload as { observations?: unknown })?.observations;
  if (!Array.isArray(observations)) {
    return { ok: false, error: { kind: 'parse', message: 'FRED response missing observations array' } };
  }

  const out: RawObservation[] = [];
  for (const obs of observations as FredObservation[]) {
    // Missing value sentinel — skip (incl. the not-yet-published latest row).
    if (obs.value === '.' || obs.value == null) continue;
    const value = Number.parseFloat(obs.value);
    if (Number.isNaN(value)) {
      return {
        ok: false,
        error: { kind: 'parse', message: `FRED non-numeric value "${obs.value}" for ${obs.date}` },
      };
    }
    if (!obs.date) {
      return { ok: false, error: { kind: 'parse', message: 'FRED observation missing date' } };
    }
    out.push({
      periodDate: toFirstOfMonthISO(new Date(`${obs.date}T00:00:00Z`)),
      value,
      releasedAt: null,
      raw: obs,
    });
  }

  // Return oldest→newest for tidy, deterministic insertion.
  out.sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  return { ok: true, observations: out };
}

export const fredAdapter: ProviderAdapter = {
  provider: 'fred',

  async fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult> {
    const apiKey = process.env['FRED_API_KEY'];
    if (!apiKey) {
      return { ok: false, error: { kind: 'transport', message: 'FRED_API_KEY is not set' } };
    }
    if (!indicator.providerSeriesCode) {
      return {
        ok: false,
        error: { kind: 'not_found', message: `Indicator ${indicator.shortLabel} has no providerSeriesCode` },
      };
    }

    const url = new URL(FRED_ENDPOINT);
    url.searchParams.set('series_id', indicator.providerSeriesCode);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', String(opts?.limit ?? 6));

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) },
      };
    }

    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `FRED HTTP ${res.status}`, status: res.status } };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'parse', message: err instanceof Error ? err.message : 'FRED JSON parse failed' },
      };
    }

    return parseFredResponse(payload);
  },
};
