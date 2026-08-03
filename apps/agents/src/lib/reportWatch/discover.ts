/**
 * Discovery phase — find candidate URLs and remember them, including the ones
 * we reject.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. Idempotence. Running discovery twice produces no new rows, only an
 *      updated `last_seen_at`. The UNIQUE (source_id, url_hash) index is the
 *      guard; the upsert is how we cooperate with it.
 *   2. Honest health. `detection_consecutive_empty` is the ONLY signal that a
 *      publisher's page structure changed under us, so it must count "the
 *      strategy ran cleanly and found nothing", never "the strategy errored".
 *      An adapter failure leaves the counter alone and surfaces as a failure —
 *      conflating the two would make a broken selector look like a quiet quarter.
 *
 * Nothing here downloads an artefact. Finding a URL and deciding it is worth
 * downloading are different problems with different failure modes, which is why
 * they get different tables and different files.
 */

import type { ReportDetectionConfig, ReportSkipReason } from '@platform/shared';
import { reportDb } from './db.js';
import { createLogger } from '../logger.js';
import { adapterFor } from './registry.js';
import { normalizeReportUrl, urlHash, passesUrlFilters } from './normalize.js';
import type { DiscoveredCandidate } from './types.js';

const log = createLogger('report-watch-discover');

/** The subset of a news_sources row discovery needs. */
export interface ReportWatchSource {
  id: string;
  name: string;
  site_url: string | null;
  detection_strategies: string[];
  detection_config: ReportDetectionConfig;
  max_candidates_per_run: number;
}

/** A candidate after normalisation and filtering, ready to persist. */
export interface EvaluatedCandidate {
  url: string;
  urlHash: string;
  rawUrl: string;
  discoveryMethod: string;
  titleHint: string | null;
  publishedAtHint: string | null;
  landingUrl: string | null;
  /** null = accepted. Set = persisted as `skipped` with this reason. */
  skipReason: ReportSkipReason | null;
}

export interface DiscoveryOutcome {
  sourceId: string;
  sourceName: string;
  /** The strategy that produced candidates, or null when none did. */
  strategyUsed: string | null;
  /** Everything the winning strategy surfaced, before the per-run cap. */
  found: number;
  /** Rows written for the first time this run. */
  newCandidates: number;
  /** Accepted candidates queued for acquisition, after the per-run cap. */
  queued: EvaluatedCandidate[];
  /** Set when every configured strategy failed. */
  error: string | null;
}

/**
 * Normalise, dedupe within the batch, and apply `url_filters`.
 *
 * Rejections are RETAINED (with a skip_reason) rather than dropped: without a
 * memory of them, a sitemap diff on a large publisher re-evaluates the same
 * few hundred non-reports on every run, forever.
 */
export function evaluateCandidates(
  raw: DiscoveredCandidate[],
  discoveryMethod: string,
  config: ReportDetectionConfig,
  siteUrl: string | null,
): EvaluatedCandidate[] {
  const out: EvaluatedCandidate[] = [];
  const seen = new Set<string>();

  for (const cand of raw) {
    const url = normalizeReportUrl(cand.rawUrl, siteUrl ?? undefined);
    // An unnormalisable href (mailto:, javascript:, a malformed relative path)
    // has no identity, so it cannot be remembered — dropping it is the only
    // option, and it costs nothing because it will be dropped again next run.
    if (!url) continue;

    const hash = urlHash(url);
    if (seen.has(hash)) continue;
    seen.add(hash);

    out.push({
      url,
      urlHash: hash,
      rawUrl: cand.rawUrl,
      discoveryMethod,
      titleHint: cand.titleHint,
      publishedAtHint: cand.publishedAtHint,
      landingUrl: cand.landingUrl
        ? normalizeReportUrl(cand.landingUrl, siteUrl ?? undefined)
        : null,
      skipReason: passesUrlFilters(url, config.url_filters) ? null : 'filter_mismatch',
    });
  }

  return out;
}

/**
 * Newest first by scraped date, undated last.
 *
 * When a run would exceed `max_candidates_per_run` the newest win and the rest
 * stay `new` for the next run. A first run against a large sitemap therefore
 * takes several days to work through the backlog, which is correct behaviour
 * rather than a bug — it is also the reason the cap sorts rather than slices
 * arbitrarily.
 */
export function orderByRecency(candidates: EvaluatedCandidate[]): EvaluatedCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.publishedAtHint === b.publishedAtHint) return 0;
    if (!a.publishedAtHint) return 1;
    if (!b.publishedAtHint) return -1;
    return b.publishedAtHint.localeCompare(a.publishedAtHint);
  });
}

/**
 * Upsert candidates on (source_id, url_hash).
 *
 * `first_seen_at` and `status` are deliberately absent from the update path:
 * re-seeing a URL must not resurrect a candidate already acquired or rejected,
 * nor reset when we first noticed it. Only `last_seen_at` and the scraped hints
 * move — a URL that disappears from the index is itself a signal, and that is
 * only readable if `last_seen_at` is honest.
 *
 * Returns the number of rows that did not already exist.
 */
async function persistCandidates(
  sourceId: string,
  candidates: EvaluatedCandidate[],
): Promise<number> {
  if (candidates.length === 0) return 0;

  const hashes = candidates.map((c) => c.urlHash);
  const { data: existing } = await reportDb
    .from('report_candidates')
    .select<{ url_hash: string }>('url_hash')
    .eq('source_id', sourceId)
    .in('url_hash', hashes);
  const known = new Set((existing ?? []).map((r) => r.url_hash));

  const now = new Date().toISOString();
  const rows = candidates.map((c) => ({
    source_id: sourceId,
    url: c.url,
    url_hash: c.urlHash,
    raw_url: c.rawUrl,
    discovery_method: c.discoveryMethod,
    title_hint: c.titleHint,
    published_at_hint: c.publishedAtHint,
    last_seen_at: now,
    ...(known.has(c.urlHash)
      ? {}
      : { status: c.skipReason ? 'skipped' : 'new', skip_reason: c.skipReason }),
  }));

  const { error } = await reportDb
    .from('report_candidates')
    .upsert(rows, { onConflict: 'source_id,url_hash' });

  if (error) {
    log.error({ err: error, sourceId }, 'candidate upsert failed');
    return 0;
  }

  return candidates.filter((c) => !known.has(c.urlHash)).length;
}

/**
 * Run discovery for one source.
 *
 * Strategies are tried in the configured order and the FIRST to return
 * candidates wins; the rest are not run. That is the v1 choice — merging all
 * configured strategies by url_hash is more robust and more expensive, and is
 * worth revisiting only if a source's RSS feed proves to be a stale subset of
 * its index page (see the spec's open questions).
 *
 * A strategy that errors does not stop the chain: the next one is tried, and
 * the error is only reported when every strategy failed.
 */
export async function discoverForSource(
  source: ReportWatchSource,
  now: Date = new Date(),
): Promise<DiscoveryOutcome> {
  const base: Omit<DiscoveryOutcome, 'strategyUsed' | 'found' | 'newCandidates' | 'queued' | 'error'> = {
    sourceId: source.id,
    sourceName: source.name,
  };

  const strategies = source.detection_strategies ?? [];
  if (strategies.length === 0) {
    return { ...base, strategyUsed: null, found: 0, newCandidates: 0, queued: [], error: 'no detection strategies configured' };
  }

  const errors: string[] = [];
  let raw: DiscoveredCandidate[] | null = null;
  let strategyUsed: string | null = null;

  for (const strategy of strategies) {
    const adapter = adapterFor(strategy);
    if (!adapter) {
      errors.push(`${strategy}: no adapter registered`);
      continue;
    }

    const result = await adapter.discover({
      config: source.detection_config ?? {},
      siteUrl: source.site_url,
      now,
    });

    if (!result.ok) {
      errors.push(`${strategy}: ${result.error.message}`);
      continue;
    }
    // A clean run that found nothing is a real answer, not a reason to try the
    // next strategy — but it is also not a win, so the chain continues and the
    // empty result stands only if nothing else produces candidates.
    if (result.candidates.length === 0) {
      strategyUsed = strategyUsed ?? strategy;
      raw = raw ?? [];
      continue;
    }

    raw = result.candidates;
    strategyUsed = strategy;
    break;
  }

  if (raw === null) {
    return {
      ...base,
      strategyUsed: null,
      found: 0,
      newCandidates: 0,
      queued: [],
      error: errors.join('; ') || 'all detection strategies failed',
    };
  }

  const evaluated = evaluateCandidates(
    raw,
    strategyUsed ?? 'index_page',
    source.detection_config ?? {},
    source.site_url,
  );
  const newCandidates = await persistCandidates(source.id, evaluated);

  const accepted = orderByRecency(evaluated.filter((c) => c.skipReason === null));
  const cap = source.max_candidates_per_run > 0 ? source.max_candidates_per_run : 25;

  log.info(
    {
      sourceId: source.id,
      strategy: strategyUsed,
      found: raw.length,
      accepted: accepted.length,
      newCandidates,
    },
    'discovery complete',
  );

  return {
    ...base,
    strategyUsed,
    found: raw.length,
    newCandidates,
    queued: accepted.slice(0, cap),
    error: null,
  };
}

/**
 * Record the run against the source's health columns.
 *
 * `detection_consecutive_empty` counts CLEAN runs that found nothing. A run
 * that errored leaves it untouched (and writes last_error instead), because a
 * broken selector and a quiet publisher must not look the same in the one view
 * built to tell them apart.
 */
export async function recordDiscoveryHealth(
  outcome: DiscoveryOutcome,
  now: Date = new Date(),
): Promise<void> {
  const iso = now.toISOString();

  const update: Record<string, unknown> = { last_scanned_at: iso };

  if (outcome.error) {
    update.last_status = 'failed';
    update.last_error = outcome.error.slice(0, 500);
  } else if (outcome.found > 0) {
    update.last_status = 'success';
    update.last_error = null;
    update.detection_last_success_at = iso;
    update.detection_consecutive_empty = 0;
  } else {
    update.last_status = 'success';
    update.last_error = null;
    // Read-modify-write rather than an RPC increment: the sweep is single
    // -threaded over sources, so there is no concurrent writer to race.
    const { data } = await reportDb
      .from('news_sources')
      .select<{ detection_consecutive_empty: number }>('detection_consecutive_empty')
      .eq('id', outcome.sourceId)
      .maybeSingle();
    const current = Number(data?.detection_consecutive_empty ?? 0);
    update.detection_consecutive_empty = current + 1;
  }

  const { error } = await reportDb.from('news_sources').update(update).eq('id', outcome.sourceId);

  if (error) log.error({ err: error, sourceId: outcome.sourceId }, 'health update failed');
}
