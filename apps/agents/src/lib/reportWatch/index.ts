// The report-watch sweep entry point, called from executeRoutineWorkflow's
// `report_watch_scan` handler.
//
// Plain `for` loops in a plain async function, deliberately. The spec drew this
// as a Mastra step graph with `.foreach()` over sources and again over
// candidates, but no batch ingestion path in this codebase is built that way —
// RSS, podcasts, ecosystem watches and newsletter links are all loops in a
// routine handler. Nesting two foreach combinators would buy step-level
// observability at the cost of being the only ingestion path shaped differently
// from the other four.
//
// Two phases per source, in order:
//   A. discover — deterministic. Finds candidate URLs and remembers them.
//   B. acquire  — for each queued candidate: fetch, store, extract, index, and
//                 hand to the feed.
//
// Never throws: a sweep that partly failed still reports what it did.
// Spec: docs/features/html-pdf-monitoring/html-pdf-monitoring.md

import { supabase } from '@platform/db';
import type { Json } from '@platform/db';
import type {
  ReportWatchScanConfig,
  ReportWatchScanResult,
  ReportRedistribution,
} from '@platform/shared';
import { reportDb } from './db.js';
import { createLogger } from '../logger.js';
import { discoverForSource, recordDiscoveryHealth, type ReportWatchSource } from './discover.js';
import { acquireCandidate } from './acquire.js';
import { RobotsCache } from './robots.js';
import { extractReport } from './extract/index.js';
import { persistReport } from './persistReport.js';
import { reportToNewsItem } from './toNewsItem.js';
import { markAcquired, markDuplicate, markSkipped, markAttemptFailed, recordHead } from './candidateStatus.js';

const log = createLogger('report-watch-scan');

/** Default cap on acquisitions per run, across all sources. */
const DEFAULT_MAX_ACQUISITIONS = 10;

const EMPTY: ReportWatchScanResult = {
  sources_scanned: 0,
  candidates_found: 0,
  candidates_new: 0,
  reports_acquired: 0,
  reports_duplicate: 0,
  reports_failed: 0,
  segments_embedded: 0,
  news_items_created: 0,
  failed_sources: [],
  empty_sources: [],
};

interface SourceRow extends ReportWatchSource {
  tier: string | null;
  crawl_delay_seconds: number;
  ocr_enabled: boolean;
  ocr_page_limit: number;
  redistribution_default: ReportRedistribution;
  licence_notes: string | null;
}

const SOURCE_COLUMNS =
  'id, name, site_url, tier, detection_strategies, detection_config, ' +
  'crawl_delay_seconds, ocr_enabled, ocr_page_limit, max_candidates_per_run, ' +
  'redistribution_default, licence_notes';

async function loadActiveSources(): Promise<SourceRow[]> {
  const { data, error } = await reportDb
    .from('news_sources')
    .select<SourceRow>(SOURCE_COLUMNS)
    .eq('is_active', true)
    .eq('source_type', 'report_watch');

  if (error) {
    log.error({ err: error }, 'failed to load report_watch sources');
    return [];
  }
  return data ?? [];
}

/**
 * Resolve a candidate row id for a discovered URL.
 *
 * Discovery upserted the row; acquisition needs its id and attempt count, and
 * re-reading is cheaper and less brittle than threading the id back through the
 * upsert (Supabase's upsert-with-select returns rows in an order that is not
 * guaranteed to match the input).
 */
async function loadCandidateRow(
  sourceId: string,
  urlHash: string,
): Promise<{ id: string; attempts: number; status: string } | null> {
  const { data } = await reportDb
    .from('report_candidates')
    .select<{ id: string; attempts: number; status: string }>('id, attempts, status')
    .eq('source_id', sourceId)
    .eq('url_hash', urlHash)
    .maybeSingle();
  return data ?? null;
}

/**
 * Log the run to agent_activity.
 *
 * `agent_name` is 'rex' rather than a new 'report_watch' name, for the reason
 * lib/ecosystem/index.ts::logRun already documents: the CHECK on agent_activity
 * (mirrored on platform_capabilities and routines) admits only the roster
 * personas, and Rex already owns the research and monitoring sweeps. A new name
 * would mean widening three constraints in lockstep for a log label.
 */
async function logRun(result: ReportWatchScanResult): Promise<void> {
  const failed = result.failed_sources.length > 0 || result.reports_failed > 0;
  const { error } = await supabase.from('agent_activity').insert({
    agent_name: 'rex',
    action: 'Report watch scan',
    status: failed ? 'error' : 'auto',
    trigger_type: 'scheduled',
    entity_type: 'reports',
    notes: JSON.stringify(result),
    approved_actions: [result] as unknown as Json,
  });
  if (error) log.error({ err: error }, 'failed to log scan run');
}

export async function runReportWatchScan(
  config: ReportWatchScanConfig = {},
  routineId: string | null = null,
  now: Date = new Date(),
): Promise<ReportWatchScanResult> {
  try {
    const result: ReportWatchScanResult = { ...EMPTY, failed_sources: [], empty_sources: [] };
    const sources = await loadActiveSources();
    if (sources.length === 0) return result;

    // One robots cache for the whole sweep: robots.txt is fetched once per host
    // per run, not once per candidate.
    const robots = new RobotsCache();
    const budget = config.max_acquisitions_per_run ?? DEFAULT_MAX_ACQUISITIONS;
    let acquisitions = 0;

    for (const source of sources) {
      result.sources_scanned += 1;

      // ── Phase A: discover ──────────────────────────────────────────────────
      const discovery = await discoverForSource(source, now);
      await recordDiscoveryHealth(discovery, now);

      result.candidates_found += discovery.found;
      result.candidates_new += discovery.newCandidates;
      if (discovery.error) {
        result.failed_sources.push(source.name);
        continue;
      }
      if (discovery.found === 0) result.empty_sources.push(source.name);

      // ── Phase B: acquire ───────────────────────────────────────────────────
      for (const candidate of discovery.queued) {
        if (acquisitions >= budget) break;

        const row = await loadCandidateRow(source.id, candidate.urlHash);
        // Only untouched candidates are worked. 'acquired', 'skipped' and
        // 'duplicate' are terminal; 'failed' has spent its retry budget.
        if (!row || (row.status !== 'new' && row.status !== 'queued')) continue;

        acquisitions += 1;
        const outcome = await acquireCandidate(
          {
            candidateId: row.id,
            url: candidate.url,
            landingUrl: candidate.landingUrl,
            sourceId: source.id,
            sourceName: source.name,
            crawlDelaySeconds: source.crawl_delay_seconds ?? 5,
            pdfLinkSelector: source.detection_config?.index_page?.pdf_link_selector,
          },
          robots,
          now,
        );

        await recordHead(row.id, {
          http_status: outcome.head.status ?? null,
          content_type: outcome.head.contentType ?? null,
          content_length: outcome.head.contentLength ?? null,
          etag: outcome.head.etag ?? null,
          last_modified: outcome.head.lastModified ?? null,
        });

        if (outcome.outcome === 'skipped') {
          await markSkipped(row.id, outcome.reason);
          continue;
        }
        if (outcome.outcome === 'duplicate') {
          await markDuplicate(row.id, outcome.reportId);
          result.reports_duplicate += 1;
          continue;
        }
        if (outcome.outcome === 'failed') {
          await markAttemptFailed(row.id, row.attempts, outcome.message);
          result.reports_failed += 1;
          continue;
        }

        // ── extract → persist → feed ─────────────────────────────────────────
        const { artefact } = outcome;
        const extraction = await extractReport({
          bytes: artefact.bytes,
          fileFormat: artefact.fileFormat,
          fileName: artefact.fileName,
          url: artefact.url,
          ocrEnabled: source.ocr_enabled ?? false,
          ocrPageLimit: source.ocr_page_limit ?? 40,
        });

        const persisted = await persistReport({
          sourceId: source.id,
          sourceName: source.name,
          candidateId: row.id,
          sourceUrl: artefact.url,
          canonicalUrl: artefact.canonicalUrl,
          contentHash: artefact.contentHash,
          storagePath: artefact.storagePath,
          fileName: artefact.fileName,
          fileSizeBytes: artefact.fileSizeBytes,
          fileFormat: artefact.fileFormat,
          titleHint: candidate.titleHint,
          publishedAtHint: candidate.publishedAtHint,
          httpLastModified: artefact.lastModified,
          redistribution: source.redistribution_default ?? 'internal_only',
          licenceNotes: source.licence_notes,
          extraction,
        });

        if (!persisted.reportId) {
          await markAttemptFailed(row.id, row.attempts, persisted.error ?? 'persist failed');
          result.reports_failed += 1;
          continue;
        }

        await markAcquired(row.id, persisted.reportId);
        result.reports_acquired += 1;
        result.segments_embedded += persisted.segments;

        const feed = await reportToNewsItem({
          reportId: persisted.reportId,
          sourceId: source.id,
          sourceName: source.name,
          sourceTier: source.tier,
          title: persisted.title,
          body: extraction.body,
          url: artefact.url,
          canonicalUrl: artefact.canonicalUrl,
          publishedAt: persisted.publishedAt,
          fileFormat: artefact.fileFormat,
          pageCount: extraction.pageCount,
          wordCount: extraction.wordCount,
          extractionQuality: extraction.quality,
          routineId,
        });
        if (feed.newsItemId) result.news_items_created += 1;
      }
    }

    log.info(
      {
        sources: result.sources_scanned,
        found: result.candidates_found,
        acquired: result.reports_acquired,
        duplicates: result.reports_duplicate,
        failures: result.reports_failed,
        segments: result.segments_embedded,
      },
      'report watch scan complete',
    );

    await logRun(result);
    return result;
  } catch (err) {
    log.error({ err }, 'report watch scan failed');
    return { ...EMPTY, failed_sources: [], empty_sources: [] };
  }
}
