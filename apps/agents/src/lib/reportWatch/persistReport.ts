/**
 * Persist an acquired, extracted report — and its segments, if the publish wall
 * lets them through.
 *
 * Two things here carry more weight than they look:
 *
 *   1. **Revision linking.** Same source URL, different `content_hash`, means
 *      the publisher revised a document in place. Both rows are kept: the new
 *      one points at the old via `revision_of_report_id`, and the old one gets
 *      `superseded_at`. Deleting the version BTS actually read would defeat the
 *      point of storing it, and quietly overwriting it would be worse — a chart
 *      cited in BTS commentary must stay retrievable as it was when cited.
 *
 *   2. **The publish wall.** Segments are written only for `good` or `partial`
 *      extractions. A `failed` extraction still produces a stored artefact and a
 *      report row marked `needs_review`, but no embeddings — indexing garbage is
 *      worse than indexing nothing, because garbage retrieves and then gets
 *      quoted.
 */

import type { ReportType, ReportRedistribution } from '@platform/shared';
import { reportDb } from './db.js';
import { embedTexts } from '../contentEmbeddings.js';
import { createLogger } from '../logger.js';
import { chunkReport } from './chunk.js';
import type { ExtractionOutput } from './extract/index.js';

const log = createLogger('report-watch-persist');

/** OpenAI's embeddings endpoint accepts arrays; a whole report is too many. */
const EMBED_BATCH = 96;

export interface PersistReportInput {
  sourceId: string;
  sourceName: string;
  candidateId: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  contentHash: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileFormat: 'pdf' | 'html';
  /** Scraped title from discovery — third in the title waterfall. */
  titleHint: string | null;
  /** Scraped date from discovery — second in the date waterfall. */
  publishedAtHint: string | null;
  /** HTTP Last-Modified — last resort for the date. */
  httpLastModified: string | null;
  redistribution: ReportRedistribution;
  licenceNotes: string | null;
  extraction: ExtractionOutput;
}

export interface PersistReportResult {
  reportId: string | null;
  segments: number;
  /** Set when this row supersedes an earlier version of the same URL. */
  revisionOf: string | null;
  /**
   * The title and date the waterfalls below resolved. Returned rather than left
   * to the caller to re-derive: both waterfalls run once, in one place, and the
   * report row and its feed item have to agree on the answer.
   */
  title: string;
  publishedAt: string | null;
  error: string | null;
}

/**
 * Title waterfall: PDF metadata → first heading in the body → scraped hint →
 * filename. Each rung is more likely to be a real title than the next, and the
 * filename is included only because a report with no title at all reads as a
 * bug in the feed.
 */
export function resolveTitle(input: PersistReportInput): string {
  const fromExtraction = input.extraction.titleHint?.trim();
  if (fromExtraction) return fromExtraction;

  const heading = /^#{1,6}\s+(.+)$/m.exec(input.extraction.body ?? '')?.[1]?.trim();
  if (heading) return heading;

  const hint = input.titleHint?.trim();
  if (hint) return hint;

  return input.fileName.replace(/\.(pdf|html?)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled report';
}

/**
 * Date waterfall: PDF metadata → scraped date → HTTP Last-Modified.
 * `published_at_source` records which rung won, because they disagree often
 * enough that "which date is this" is a real question when reading the row.
 */
export function resolvePublishedAt(input: PersistReportInput): {
  publishedAt: string | null;
  source: 'pdf_metadata' | 'scraped' | 'http_last_modified' | null;
} {
  if (input.extraction.publishedAtHint) {
    return { publishedAt: input.extraction.publishedAtHint, source: 'pdf_metadata' };
  }
  if (input.publishedAtHint) {
    return { publishedAt: input.publishedAtHint, source: 'scraped' };
  }
  if (input.httpLastModified) {
    const parsed = Date.parse(input.httpLastModified);
    if (!Number.isNaN(parsed)) {
      return { publishedAt: new Date(parsed).toISOString().slice(0, 10), source: 'http_last_modified' };
    }
  }
  return { publishedAt: null, source: null };
}

/**
 * Classify the report from its title, deterministically.
 *
 * A keyword match rather than a model call: `report_type` is a filing label, not
 * a judgement, and getting it slightly wrong on an ambiguous title costs less
 * than an LLM call per report costs in money and latency.
 */
export function classifyReportType(title: string): ReportType {
  const t = title.toLowerCase();
  if (/\b(q[1-4]|quarter(ly)?|h[12] 20\d\d)\b/.test(t)) return 'quarterly';
  if (/\bannual|full[- ]year|fy ?20\d\d\b/.test(t)) return 'annual';
  if (/\bwhite ?paper|primer\b/.test(t)) return 'whitepaper';
  if (/\bsurvey|census|poll\b/.test(t)) return 'survey';
  if (/\bconsultation|guidance|regulat|compliance|legislat|info ?sheet\b/.test(t)) return 'regulatory';
  if (/\bweekly|monthly|market (update|wrap|commentary)|on[- ]chain\b/.test(t)) return 'market_update';
  if (/\bnote|brief(ing)?\b/.test(t)) return 'research_note';
  return 'other';
}

/**
 * Find a prior report acquired from the same URL. A match means the publisher
 * changed the bytes behind a stable URL — the silent in-place revision the
 * `content_hash` identity rule is designed to catch from the other direction.
 */
async function findPredecessor(sourceUrl: string, contentHash: string): Promise<string | null> {
  const { data } = await reportDb
    .from('reports')
    .select<{ id: string; content_hash: string }>('id, content_hash')
    .eq('source_url', sourceUrl)
    .is('superseded_at', null)
    .limit(1);

  const prior = (data ?? [])[0];
  if (!prior || prior.content_hash === contentHash) return null;
  return prior.id;
}

/** Chunk, embed and write segments. Returns the number written. */
async function writeSegments(reportId: string, extraction: ExtractionOutput): Promise<number> {
  const drafts = chunkReport(extraction.pages, extraction.pageCount !== null);
  if (drafts.length === 0) return 0;

  // Idempotent: a re-run replaces rather than duplicates.
  const { error: delError } = await reportDb
    .from('report_segments')
    .delete()
    .eq('report_id', reportId);
  if (delError) {
    log.error({ err: delError, reportId }, 'segment clear failed');
    return 0;
  }

  const embeddings: number[][] = [];
  for (let i = 0; i < drafts.length; i += EMBED_BATCH) {
    embeddings.push(...(await embedTexts(drafts.slice(i, i + EMBED_BATCH).map((d) => d.content))));
  }

  const rows = drafts.map((d, i) => ({
    report_id: reportId,
    segment_index: d.segmentIndex,
    page_number: d.pageNumber,
    heading_path: d.headingPath,
    content: d.content,
    token_count: d.tokenCount,
    embedding: embeddings[i] ?? [],
  }));

  const { error } = await reportDb.from('report_segments').insert(rows);
  if (error) {
    log.error({ err: error, reportId }, 'segment insert failed');
    return 0;
  }
  return rows.length;
}

export async function persistReport(input: PersistReportInput): Promise<PersistReportResult> {
  const title = resolveTitle(input);
  const { publishedAt, source: publishedAtSource } = resolvePublishedAt(input);
  const { extraction } = input;

  const revisionOf = await findPredecessor(input.sourceUrl, input.contentHash);

  const row = {
    source_id: input.sourceId,
    candidate_id: input.candidateId,
    title,
    publisher: input.sourceName,
    report_type: classifyReportType(title),
    published_at: publishedAt,
    published_at_source: publishedAtSource,
    source_url: input.sourceUrl,
    canonical_url: input.canonicalUrl,
    file_format: input.fileFormat,
    storage_path: input.storagePath,
    file_name: input.fileName,
    file_size_bytes: input.fileSizeBytes,
    content_hash: input.contentHash,
    page_count: extraction.pageCount,
    word_count: extraction.wordCount,
    body: extraction.body || null,
    extraction_method: extraction.method,
    extraction_quality: extraction.quality,
    extraction_metrics: extraction.metrics,
    ocr_used: extraction.ocrUsed,
    revision_of_report_id: revisionOf,
    redistribution: input.redistribution,
    licence_notes: input.licenceNotes,
    // A report we cannot read is flagged for a human rather than presented as
    // ingested. The artefact and the feed item still exist.
    status: extraction.quality === 'failed' ? 'needs_review' : 'ingested',
  };

  const { data: inserted, error } = await reportDb
    .from('reports')
    .insert<{ id: string }>(row)
    .select('id')
    .single();

  if (error) {
    return { reportId: null, segments: 0, revisionOf, title, publishedAt, error: error.message };
  }
  const reportId = inserted?.id ?? null;
  if (!reportId) {
    return { reportId: null, segments: 0, revisionOf, title, publishedAt, error: 'insert returned no id' };
  }

  // Stamp the predecessor only after the successor exists, so a failed insert
  // cannot leave the corpus with nothing current for that URL.
  if (revisionOf) {
    const { error: supersedeError } = await reportDb
      .from('reports')
      .update({ superseded_at: new Date().toISOString() })
      .eq('id', revisionOf);
    if (supersedeError) log.error({ err: supersedeError, revisionOf }, 'supersede stamp failed');
  }

  // ── the publish wall ───────────────────────────────────────────────────────
  let segments = 0;
  if (extraction.quality !== 'failed') {
    try {
      segments = await writeSegments(reportId, extraction);
    } catch (err) {
      // A failed embed leaves a valid, readable report with no vectors — worse
      // than having them, but far better than losing the report.
      log.error({ err, reportId }, 'segment embedding failed');
    }
  }

  log.info(
    { reportId, title, quality: extraction.quality, segments, revisionOf },
    'report persisted',
  );

  return { reportId, segments, revisionOf, title, publishedAt, error: null };
}
