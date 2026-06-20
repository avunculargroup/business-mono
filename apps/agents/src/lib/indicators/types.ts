/**
 * Provider adapter contract for economic indicators.
 *
 * The single seam every provider (FRED, RBA, ABS) crosses. Adapters fetch and
 * parse only — they never touch the database. Diffing, supersession and the
 * (indicator_id, period_date, released_at) revision logic all live in the
 * workflow (runIndicatorPoll). An adapter is a pure function from an indicator
 * config to normalised observations, so it is testable against a recorded
 * fixture with no Supabase, no Mastra, no network.
 *
 * See docs/features/economic-indicators/adapter-contract.md.
 */

export type Provider = 'fred' | 'rba' | 'abs';

/** What every adapter returns, per observation. The DB columns
 *  period_date / value / released_at / raw map 1:1 onto this. */
export interface RawObservation {
  /** Reference period the figure pertains to. ISO 'YYYY-MM-DD', normalised to
   *  the FIRST day of the period (see period.ts). */
  periodDate: string;
  /** The figure. Plain number — safe for these magnitudes. DB stores NUMERIC(18,4). */
  value: number;
  /** When the PROVIDER published this value. ISO 'YYYY-MM-DD', or null if the
   *  provider doesn't expose it. The workflow supplies the fetch-date fallback. */
  releasedAt: string | null;
  /** The provider payload slice this observation was parsed from. Lands in
   *  indicator_observations.raw for audit and re-parse. */
  raw: unknown;
}

/** The fields an adapter needs off the registry row. */
export interface IndicatorConfig {
  id: string;
  shortLabel: string;
  provider: Provider;
  providerSeriesCode: string | null; // FRED series_id
  providerTableRef: string | null;   // RBA table / ABS dataflow
}

/** Per-call options the workflow controls (e.g. backfill depth on first ingest). */
export interface FetchOptions {
  /** Max observations to return, newest-first intent. Larger on first ingest. */
  limit?: number;
}

export interface AdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit';
  message: string;
  status?: number; // HTTP status where relevant
}

/** Adapters never throw across the seam — one failing provider must not abort
 *  the daily sweep. They return a typed result; the workflow logs and moves on. */
export type AdapterResult =
  | { ok: true; observations: RawObservation[] }
  | { ok: false; error: AdapterError };

export interface ProviderAdapter {
  readonly provider: Provider;
  /** Fetch the latest available observation(s) for this indicator. Returns an
   *  ARRAY because a single poll may surface more than one new period (a missed
   *  month, or a first-ever backfill window). Returns ok:true with [] when there
   *  is simply nothing — that is a no-op, not an error. */
  fetchLatest(indicator: IndicatorConfig, opts?: FetchOptions): Promise<AdapterResult>;
}
