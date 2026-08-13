/**
 * SoSoValue adapter — US spot Bitcoin ETF flows and assets. Two endpoints off
 * one provider, because the two metrics are shaped differently:
 *
 *   POST /openapi/v2/etf/historicalInflowChart  → etf_net_flow   (daily series)
 *   POST /openapi/v2/etf/currentEtfDataMetrics  → etf_net_assets (one level)
 *
 * both with body {"type":"us-btc-spot"} and header x-soso-api-key. Needs
 * SOSOVALUE_API_KEY set (Railway), same pattern as BGEOMETRICS_API_KEY.
 *
 * The flow endpoint returns the FULL history in one call (no date-range params
 * sent), so backfill and steady polls are identical — runOnchainPoll's per-day
 * supersession dedupes either way. The assets endpoint is point-in-time: one
 * observation per poll, dated by the payload's own as-at date, so that series
 * accumulates a day at a time instead of backfilling.
 *
 * UNITS: the API reports raw USD; the registry stores flows in USD millions and
 * assets in USD billions (the scale both the source and every write-up quote,
 * and what keeps the report's plain toLocaleString output readable). Scaling is
 * driven by the indicator's `unit` — the contract's normalisation seam, same
 * role hash rate's H/s → EH/s conversion plays in the mempool adapter.
 *
 * RESPONSE SHAPE NOT HAND-VERIFIED — no third-party network egress from the
 * environment this was written in (same situation as the bgeometrics adapter).
 * Best-documented guess: a `{ code, data, msg }` envelope wrapping either an
 * array of `{ date, totalNetInflow }` rows or an object carrying
 * `totalNetAssets` + an as-at date, with numbers possibly arriving as strings.
 * The parsers fail loudly — with the raw body attached — on anything else, so a
 * wrong guess surfaces in agent_activity/logs on the first live poll instead of
 * silently storing garbage. What they CANNOT catch is a units mismatch: if the
 * API already returns millions, the divisor below makes every figure 1e6 too
 * small and still parses. Eyeball the first poll against sosovalue.com.
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
import { createLogger } from '../../logger.js';

const log = createLogger('sosovalue-adapter');

const BASE_URL = 'https://api.sosovalue.xyz/openapi/v2/etf';
const ETF_TYPE = 'us-btc-spot';

export const FLOW_KEY = 'etf_net_flow';
export const ASSETS_KEY = 'etf_net_assets';

/** Raw USD → the unit the indicator is stored in. */
function scaleFor(unit: string): number {
  if (unit === 'usd_million') return 1e6;
  if (unit === 'usd_billion') return 1e9;
  return 1;
}

/** Unwrap the `{ code, data, msg }` envelope. A non-zero code is an API-level
 *  failure (bad key, unknown type) served with HTTP 200, so it must not be read
 *  as data. Payloads that are already bare data pass through. */
function unwrap(payload: unknown, endpoint: string): { ok: true; data: unknown } | { ok: false; error: AdapterError } {
  if (payload == null || typeof payload !== 'object') {
    return { ok: false, error: { kind: 'parse', message: `sosovalue ${endpoint}: expected an object, got: ${JSON.stringify(payload).slice(0, 300)}` } };
  }
  const env = payload as { code?: unknown; data?: unknown; msg?: unknown; message?: unknown };
  if (!('data' in env)) return { ok: true, data: payload };
  if (env.code != null && String(env.code) !== '0') {
    const msg = typeof env.msg === 'string' ? env.msg : typeof env.message === 'string' ? env.message : 'no message';
    return { ok: false, error: { kind: 'transport', message: `sosovalue ${endpoint}: API code ${String(env.code)} — ${msg}` } };
  }
  return { ok: true, data: env.data };
}

/** A number that may arrive as a numeric string. Returns null when absent. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

/** First present key from a row, by preference order. */
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
  return null;
}

const DATE_KEYS = ['date', 'd', 'lastUpdateDate', 'updateDate'];

/** 'YYYY-MM-DD' off a date field that may be a date string or an epoch ms number. */
function parseDay(v: unknown): string | null {
  if (typeof v === 'number') return utcDate(new Date(v));
  if (typeof v !== 'string' || !v) return null;
  const iso = v.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : utcDate(d);
}

/** Pure parse step — exported for fixture tests (no network). One observation
 *  per session in the history, oldest→newest. */
export function parseFlowHistory(payload: unknown, config: OnchainIndicatorConfig): AdapterResult {
  const unwrapped = unwrap(payload, 'historicalInflowChart');
  if (!unwrapped.ok) return unwrapped;

  const rows = unwrapped.data;
  if (!Array.isArray(rows)) {
    return { ok: false, error: { kind: 'parse', message: `sosovalue historicalInflowChart: expected an array of sessions, got: ${JSON.stringify(rows).slice(0, 300)}` } };
  }

  const scale = scaleFor(config.unit);
  const out: RawObservation[] = [];
  for (const raw of rows as Record<string, unknown>[]) {
    if (raw == null || typeof raw !== 'object') {
      return { ok: false, error: { kind: 'parse', message: `sosovalue historicalInflowChart: non-object row: ${JSON.stringify(raw).slice(0, 300)}` } };
    }
    const observedAt = parseDay(pick(raw, DATE_KEYS));
    if (!observedAt) {
      return { ok: false, error: { kind: 'parse', message: `sosovalue historicalInflowChart: row missing a usable date: ${JSON.stringify(raw).slice(0, 300)}` } };
    }
    const flow = num(pick(raw, ['totalNetInflow', 'totalNetInflowUsd', 'netInflow']));
    if (flow == null) continue; // session not settled yet — absent, not zero
    out.push({ observedAt, key: config.key, value: flow / scale, raw });
  }

  out.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return { ok: true, observations: out };
}

/** Pure parse step — exported for fixture tests (no network). One observation:
 *  the current total net assets, dated by the payload's own as-at date (falling
 *  back to today when it carries none). */
export function parseCurrentMetrics(payload: unknown, config: OnchainIndicatorConfig): AdapterResult {
  const unwrapped = unwrap(payload, 'currentEtfDataMetrics');
  if (!unwrapped.ok) return unwrapped;

  const data = unwrapped.data;
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: { kind: 'parse', message: `sosovalue currentEtfDataMetrics: expected an object, got: ${JSON.stringify(data).slice(0, 300)}` } };
  }

  const row = data as Record<string, unknown>;
  const assets = num(pick(row, ['totalNetAssets', 'totalNetAsset', 'netAssets']));
  if (assets == null) {
    return { ok: false, error: { kind: 'parse', message: `sosovalue currentEtfDataMetrics: no totalNetAssets in: ${JSON.stringify(row).slice(0, 300)}` } };
  }

  const observedAt = parseDay(pick(row, DATE_KEYS)) ?? utcDate(new Date());
  return {
    ok: true,
    observations: [{ observedAt, key: config.key, value: assets / scaleFor(config.unit), raw: row }],
  };
}

/** POST {"type":"us-btc-spot"} to one endpoint and hand back its JSON body. */
async function post(endpoint: string, apiKey: string): Promise<{ ok: true; payload: unknown } | { ok: false; error: AdapterError }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-soso-api-key': apiKey },
      body: JSON.stringify({ type: ETF_TYPE }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
  }
  if (!res.ok) {
    const kind: AdapterError['kind'] = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
    return { ok: false, error: { kind, message: `sosovalue ${endpoint} HTTP ${res.status}`, status: res.status } };
  }
  try {
    return { ok: true, payload: await res.json() };
  } catch (err) {
    return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : `sosovalue ${endpoint} JSON parse failed` } };
  }
}

export const sosovalueAdapter: OnchainAdapter = {
  provider: 'sosovalue',

  async fetchLatest(indicators: OnchainIndicatorConfig[]): Promise<AdapterResult> {
    const flow = indicators.find((i) => i.key === FLOW_KEY);
    const assets = indicators.find((i) => i.key === ASSETS_KEY);
    if (!flow && !assets) {
      return { ok: false, error: { kind: 'not_found', message: 'sosovalue adapter called with no ETF indicators' } };
    }

    const apiKey = process.env['SOSOVALUE_API_KEY'];
    if (!apiKey) {
      return { ok: false, error: { kind: 'transport', message: 'SOSOVALUE_API_KEY is not set' } };
    }

    const observations: RawObservation[] = [];
    const errors: AdapterError[] = [];

    const jobs: Array<{ endpoint: string; config: OnchainIndicatorConfig; parse: (p: unknown, c: OnchainIndicatorConfig) => AdapterResult }> = [];
    if (flow) jobs.push({ endpoint: 'historicalInflowChart', config: flow, parse: parseFlowHistory });
    if (assets) jobs.push({ endpoint: 'currentEtfDataMetrics', config: assets, parse: parseCurrentMetrics });

    for (const job of jobs) {
      const res = await post(job.endpoint, apiKey);
      if (!res.ok) {
        errors.push(res.error);
        continue;
      }
      const parsed = job.parse(res.payload, job.config);
      if (!parsed.ok) errors.push(parsed.error);
      else observations.push(...parsed.observations);
    }

    // The two endpoints fail independently. Only a total failure is an adapter
    // error (the poll records it against the provider); a partial one still
    // returns what landed, so one dead endpoint can't take the other's series
    // down with it — but it must not pass silently either.
    if (observations.length === 0 && errors.length > 0) return { ok: false, error: errors[0] };
    if (errors.length > 0) {
      log.warn({ errors: errors.map((e) => `${e.kind}: ${e.message}`) }, 'sosovalue partial fetch failure');
    }
    return { ok: true, observations };
  },
};
