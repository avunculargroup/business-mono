/**
 * Gold API adapter — free, keyless daily spot-gold feed (XAU/USD).
 *
 * Replaces Stooq for gold: the Stooq CSV endpoint (added in
 * 20260719000000_gold_price_stooq_source.sql) has failed on every single
 * indicator_poll run since that migration landed — it now answers with an
 * HTML "verify your browser" bot-check page instead of CSV for server-side
 * requests, not a transient blip. See agent_activity notes on the "Daily
 * economic indicator poll" routine for the failure history.
 *
 * GET https://api.gold-api.com/price/XAU
 *   → JSON: { price: number, ... }  (gold-api.com/docs — free, no key, no
 *     documented rate limit)
 *
 * There is no history/backfill endpoint used here: this reads today's spot
 * price once per poll and lets the observation history accumulate day by
 * day, same as any newly-seeded daily indicator. releasedAt is null — the
 * workflow's fetch-date fallback applies, same convention as every other
 * adapter here.
 *
 * The response shape below was not hand-verified against a live call (no
 * network egress from the environment this adapter was written in), so the
 * parser fails loudly — with the raw body attached — on anything other than
 * a numeric `price` field, instead of guessing at a shape and risking a
 * silent bad write. If the first production poll fails, the error message
 * in agent_activity.notes will contain the real response body needed to
 * correct this.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

import type {
  AdapterResult,
  FetchOptions,
  IndicatorConfig,
  ProviderAdapter,
} from '../types.js';
import { toISODateUTC } from '../period.js';

const GOLD_API_ENDPOINT = 'https://api.gold-api.com/price/XAU';

/** Pure parse step — exported for fixture tests (no network). */
export function parseGoldApiResponse(text: string, now: Date = new Date()): AdapterResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'parse', message: `Gold API: non-JSON response: ${text.slice(0, 300)}` } };
  }

  if (typeof json !== 'object' || json === null || !('price' in json)) {
    return { ok: false, error: { kind: 'parse', message: `Gold API: unexpected response shape: ${text.slice(0, 300)}` } };
  }
  const value = Number((json as Record<string, unknown>)['price']);
  if (!Number.isFinite(value)) {
    return { ok: false, error: { kind: 'parse', message: `Gold API: non-numeric price: ${text.slice(0, 300)}` } };
  }

  return {
    ok: true,
    observations: [
      {
        periodDate: toISODateUTC(now),
        value,
        releasedAt: null,
        raw: json,
      },
    ],
  };
}

export const goldApiAdapter: ProviderAdapter = {
  provider: 'gold_api',

  async fetchLatest(_indicator: IndicatorConfig, _opts?: FetchOptions): Promise<AdapterResult> {
    let res: Response;
    try {
      res = await fetch(GOLD_API_ENDPOINT, {
        headers: { 'User-Agent': 'BTS-platform/1.0 (economic-indicators)' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `Gold API HTTP ${res.status}`, status: res.status } };
    }

    const text = await res.text();
    return parseGoldApiResponse(text);
  },
};
