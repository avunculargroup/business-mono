/**
 * Provider adapter contract for on-chain indicators.
 *
 * The single seam every provider (mempool.space, Coin Metrics) crosses. Adapters
 * fetch and parse only — they never touch the database, never compute derived
 * metrics, never run supersession. An adapter is a pure function from a set of
 * indicator configs to normalised observations, so its parse step is testable
 * against a recorded fixture with no Supabase, no Mastra, no network.
 *
 * Two differences from the economic-indicators contract:
 *   1. fetchLatest takes an ARRAY of configs — one poll can surface many keys at
 *      once (Coin Metrics batches all its metrics into a single request).
 *   2. Each observation carries its `key` (the registry slug) so the workflow can
 *      route a batched response back to the right indicator. There is no
 *      period-vs-release gap, so there is no releasedAt — observedAt is just the
 *      UTC day the value pertains to.
 *
 * See docs/features/onchain-indicators/adapter-contract.md.
 */

export type OnchainProvider = 'mempool' | 'coinmetrics';

/** What every adapter returns, per observation. The DB columns observed_at /
 *  value / raw map 1:1; `key` selects the indicator row. */
export interface RawObservation {
  /** The day the value pertains to. ISO 'YYYY-MM-DD', UTC calendar date. */
  observedAt: string;
  /** The indicator this value is for, by registry key (one fetch yields many). */
  key: string;
  /** Already normalised to the indicator's unit (e.g. hash rate in EH/s, not H/s). */
  value: number;
  /** The provider payload slice this came from. Lands in onchain_observations.raw. */
  raw: unknown;
}

/** The registry fields an adapter needs off the row. */
export interface OnchainIndicatorConfig {
  key: string;
  provider: OnchainProvider;
  providerMetricCode: string | null; // CM metric id; null where the endpoint implies it
  unit: string;                      // drives normalisation (eh_s, usd, ratio, count, percent, btc)
}

/** Per-call options the workflow controls. */
export interface FetchOptions {
  /** When set, pull this many days of history (first ingest). Point-in-time
   *  endpoints (e.g. difficulty-adjustment) ignore it and still return one row. */
  backfillDays?: number;
}

export interface AdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit';
  message: string;
  status?: number; // HTTP status where relevant
}

/** Adapters never throw across the seam — one failing provider must not abort the
 *  daily sweep. They return a typed result; the workflow logs and moves on. */
export type AdapterResult =
  | { ok: true; observations: RawObservation[] }
  | { ok: false; error: AdapterError };

export interface OnchainAdapter {
  readonly provider: OnchainProvider;
  /** Fetch the latest available observation(s) for the given indicators. May
   *  return many keys at once. Returns ok:true with [] when nothing is new — a
   *  no-op, not an error. */
  fetchLatest(indicators: OnchainIndicatorConfig[], opts?: FetchOptions): Promise<AdapterResult>;
}

/** Today's (or any date's) UTC calendar date as 'YYYY-MM-DD'. */
export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
