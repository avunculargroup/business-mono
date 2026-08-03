/**
 * Adapter contract for report discovery.
 *
 * The single seam every detection strategy crosses. A discovery adapter fetches
 * and parses only — it never touches the database, never downloads an artefact,
 * never decides whether a URL is worth acquiring. It is a function from
 * (config, source context) to a list of candidate URLs, so its parse step is
 * testable against a recorded fixture with no Supabase, no Mastra, and no
 * network.
 *
 * Two rules that are load-bearing rather than stylistic, both inherited from
 * lib/ecosystem/types.ts because they were right there too:
 *
 *   1. Adapters never throw across the seam. One publisher who redesigned their
 *      site must not abort the sweep for the other nine.
 *   2. When an adapter cannot determine the current state, it returns
 *      `ok: false`, never an empty candidate list presented as a clean read.
 *      An empty list is the silent-failure signal Simon alerts on, so an
 *      adapter that fabricates one poisons the only health metric this feature
 *      has.
 *
 * Spec: docs/features/html-pdf-monitoring/html-pdf-monitoring.md
 */

import type { ReportDetectionStrategy, ReportDetectionConfig } from '@platform/shared';

/** A URL discovery surfaced, before normalisation, filtering or acquisition. */
export interface DiscoveredCandidate {
  /** As found on the page/feed. Normalisation happens in the caller. */
  rawUrl: string;
  /** Scraped title, when the strategy provided one. Never authoritative. */
  titleHint: string | null;
  /** Scraped date as YYYY-MM-DD, when parseable. Never authoritative. */
  publishedAtHint: string | null;
  /**
   * The landing page a `follow_to_pdf` hop should start from, when the strategy
   * found a page rather than an artefact. Acquisition follows exactly one hop.
   */
  landingUrl?: string | null;
}

export interface ReportAdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit' | 'config';
  message: string;
  status?: number;
}

export type ReportAdapterResult =
  | { ok: true; candidates: DiscoveredCandidate[] }
  | { ok: false; error: ReportAdapterError };

/** What the adapter is handed off the news_sources row. */
export interface ReportAdapterInput {
  /** The source's `detection_config` JSONB, unvalidated — the adapter checks its own shape. */
  config: ReportDetectionConfig;
  /** Used to resolve relative hrefs when the config URL is the only base available. */
  siteUrl: string | null;
  /** Run clock, injected so date-relative parsing is testable. */
  now: Date;
}

export interface ReportDiscoveryAdapter {
  readonly strategy: ReportDetectionStrategy;
  /**
   * Unlike the ecosystem adapters, there is no first-run anchoring here: a
   * report watch's memory lives in `report_candidates`, not in a `last_state`
   * blob, and a first run against a publisher's back catalogue is genuinely
   * wanted — `max_candidates_per_run` paces it instead.
   */
  discover(input: ReportAdapterInput): Promise<ReportAdapterResult>;
}

export function configError(message: string): ReportAdapterResult {
  return { ok: false, error: { kind: 'config', message } };
}

/** Parse a scraped date string to YYYY-MM-DD, or null. Never guesses a year. */
export function parseDateHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  // ISO-ish prefix first — `<time datetime="2026-07-01T00:00:00Z">` is the
  // common case and Date.parse handles the rest tolerably.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}
