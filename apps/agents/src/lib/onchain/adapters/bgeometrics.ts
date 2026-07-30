/**
 * BGeometrics adapter — fetches realised cap (the input `realised_price`
 * derives from). Coin Metrics' free community tier has never actually served
 * `CapRealUSD` (confirmed: zero observations ever ingested since this feature
 * launched, while its sibling community metrics SplyCur/AdrActCnt have
 * ~36,000 rows apiece) — the same Pro-gating that hit CapMVRVCur
 * (20260710000000_derive_mvrv.sql), except realised cap can't be derived from
 * data we already have (it's cost-basis-weighted, not price × supply).
 *
 *   GET https://api.bgeometrics.com/v1/realized-cap?token=...
 *
 * Free tier: self-serve registration at portal.bgeometrics.com, no card, rate
 * limited to 8 req/hour and 15/day — comfortably covers one poll/day. Needs
 * BGEOMETRICS_API_KEY set (Railway), same pattern as FRED_API_KEY.
 *
 * RESPONSE SHAPE NOT HAND-VERIFIED — no network egress from the environment
 * this was written in (same situation as the Gold API fix). Best-documented
 * guess: an array of `{ d: "YYYY-MM-DD", realizedCap: "<number-as-string>" }`
 * rows, oldest→newest, mirroring both this project's other bitcoin-data
 * adapter (Coin Metrics: numeric values arrive as strings) and BGeometrics'
 * own short `d` date-key convention used across its chart pages. The parser
 * fails loudly — with the raw body attached — on anything else, so a wrong
 * guess surfaces in agent_activity/logs on the first live poll instead of
 * silently storing garbage or (worse) misreading an unrelated field as the
 * value.
 *
 * One call returns the FULL history (no date-range params sent) — backfill
 * and steady polls are identical; runOnchainPoll's per-day supersession
 * dedupes either way.
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

const ENDPOINT = 'https://api.bgeometrics.com/v1/realized-cap';

interface BgeometricsRow {
  d?: unknown;
  realizedCap?: unknown;
}

/** Pure parse step — exported for fixture tests (no network). `key` is the
 *  registry key this endpoint feeds (realised_cap) — this adapter only ever
 *  fetches the one metric, unlike Coin Metrics' batched byCode map. */
export function parseBgeometricsResponse(payload: unknown, key: string): AdapterResult {
  if (!Array.isArray(payload)) {
    return {
      ok: false,
      error: { kind: 'parse', message: `BGeometrics realized-cap: expected an array, got: ${JSON.stringify(payload).slice(0, 300)}` },
    };
  }

  const out: RawObservation[] = [];
  for (const row of payload as BgeometricsRow[]) {
    if (typeof row.d !== 'string' || !row.d) {
      return { ok: false, error: { kind: 'parse', message: `BGeometrics realized-cap: row missing date "d": ${JSON.stringify(row).slice(0, 300)}` } };
    }
    if (row.realizedCap == null || row.realizedCap === '') continue; // no value for this day — absent, not zero
    const value = typeof row.realizedCap === 'number' ? row.realizedCap : Number.parseFloat(String(row.realizedCap));
    if (Number.isNaN(value)) {
      return { ok: false, error: { kind: 'parse', message: `BGeometrics realized-cap: non-numeric value "${String(row.realizedCap)}" for ${row.d}` } };
    }
    out.push({ observedAt: utcDate(new Date(row.d)), key, value, raw: row });
  }

  out.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return { ok: true, observations: out };
}

export const bgeometricsAdapter: OnchainAdapter = {
  provider: 'bgeometrics',

  async fetchLatest(indicators: OnchainIndicatorConfig[]): Promise<AdapterResult> {
    const indicator = indicators.find((i) => i.key === 'realised_cap');
    if (!indicator) {
      return { ok: false, error: { kind: 'not_found', message: 'BGeometrics adapter called without a realised_cap indicator' } };
    }

    const apiKey = process.env['BGEOMETRICS_API_KEY'];
    if (!apiKey) {
      return { ok: false, error: { kind: 'transport', message: 'BGEOMETRICS_API_KEY is not set' } };
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set('token', apiKey);

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      const error: AdapterError = { kind: 'transport', message: err instanceof Error ? err.message : String(err) };
      return { ok: false, error };
    }
    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `BGeometrics HTTP ${res.status}`, status: res.status } };
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'BGeometrics JSON parse failed' } };
    }

    return parseBgeometricsResponse(payload, indicator.key);
  },
};
