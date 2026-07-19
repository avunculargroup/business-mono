/**
 * Stooq adapter — a free, keyless daily price feed, used where FRED has no usable
 * current series. Gold is the motivating case: FRED's LBMA fixing series
 * (GOLDAMGBD228NLBM) was discontinued and no longer serves current values, so the
 * daily poll could never pull a fresh gold price. Stooq publishes XAUUSD (spot
 * gold, USD/oz) as a daily CSV with real history and no API key.
 *
 * GET https://stooq.com/q/d/l/?s={providerSeriesCode}&i=d
 *   → CSV: Date,Open,High,Low,Close,Volume  (oldest→newest, dates 'YYYY-MM-DD')
 *
 * We take the Close as the daily value. Like the RBA adapter this parses the FULL
 * history every call, so an empty result is treated as a FAILURE, not a no-op —
 * an empty body means the symbol/feed changed, never "nothing new today". Stooq
 * also answers HTTP 200 with a plain-text body when rate-limited ("Exceeded the
 * daily hits limit…"); that is surfaced as a rate_limit error, not a parse error.
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
import { toISODateUTC } from '../period.js';
import { parseCsv } from './rba.js';

const STOOQ_ENDPOINT = 'https://stooq.com/q/d/l/';

// Data-row dates are ISO 'YYYY-MM-DD'.
const DATE_CELL = /^\d{4}-\d{2}-\d{2}$/;

/** Pure parse step — exported for fixture tests (no network). Stooq only serves
 *  daily bars, so every observation keeps its actual day. */
export function parseStooqCsv(text: string): AdapterResult {
  // Stooq answers 200 with a plain-text body when rate-limited — detect it before
  // treating a header-less body as a generic parse failure.
  if (/exceeded the daily hits limit/i.test(text)) {
    return { ok: false, error: { kind: 'rate_limit', message: 'Stooq: exceeded the daily hits limit' } };
  }

  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const header = rows[0];
  if (!header) {
    return { ok: false, error: { kind: 'parse', message: 'Stooq CSV: empty response' } };
  }

  const idx = (label: string) =>
    header.findIndex((c) => c.trim().toLowerCase() === label);
  const dateCol = idx('date');
  const closeCol = idx('close');
  if (dateCol === -1 || closeCol === -1) {
    return {
      ok: false,
      error: { kind: 'parse', message: `Stooq CSV: missing Date/Close header (got "${header.join(',')}")` },
    };
  }

  const out: RawObservation[] = [];
  for (const r of rows.slice(1)) {
    const dateCell = (r[dateCol] ?? '').trim();
    if (!DATE_CELL.test(dateCell)) continue; // skip any stray non-data row
    const cell = (r[closeCol] ?? '').trim();
    if (cell === '') continue; // no close for this bar — skip, don't zero
    const value = Number.parseFloat(cell);
    if (Number.isNaN(value)) {
      return { ok: false, error: { kind: 'parse', message: `Stooq CSV: non-numeric close "${cell}" at ${dateCell}` } };
    }
    out.push({
      periodDate: toISODateUTC(new Date(`${dateCell}T00:00:00Z`)),
      value,
      releasedAt: null,
      raw: { date: dateCell, close: cell },
    });
  }

  // Full-history fetch: an empty result is never a genuine no-op (that would be
  // FRED's windowed semantics). Surface it so it lands in agent_activity.
  if (out.length === 0) {
    return {
      ok: false,
      error: { kind: 'parse', message: 'Stooq CSV: header present but no data rows — symbol or feed may have changed' },
    };
  }

  out.sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  return { ok: true, observations: out };
}

export const stooqAdapter: ProviderAdapter = {
  provider: 'stooq',

  async fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult> {
    if (!indicator.providerSeriesCode) {
      return { ok: false, error: { kind: 'not_found', message: `Indicator ${indicator.shortLabel} has no providerSeriesCode (Stooq symbol)` } };
    }

    const url = new URL(STOOQ_ENDPOINT);
    url.searchParams.set('s', indicator.providerSeriesCode);
    url.searchParams.set('i', 'd');

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'BTS-platform/1.0 (economic-indicators)' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
    }
    if (!res.ok) {
      const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
      return { ok: false, error: { kind, message: `Stooq HTTP ${res.status}`, status: res.status } };
    }

    const text = await res.text();
    const result = parseStooqCsv(text);
    // Apply backfill/limit: keep the most recent N (parse returns oldest→newest).
    if (result.ok && opts?.limit && result.observations.length > opts.limit) {
      return { ok: true, observations: result.observations.slice(-opts.limit) };
    }
    return result;
  },
};
