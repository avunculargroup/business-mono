/**
 * Feed handoff — surface an acquired report as an ordinary news_item.
 *
 * The spec drew this as two workflow steps, `createNewsItem` then
 * `scoreWithRex`. Both collapse into ONE call to the existing
 * `ingestNewsItem()` pipeline, which already does dedupe → embed →
 * semantic-dedupe/novelty → Rex rubric → persist. Building a parallel scoring
 * and persistence path would have given reports a second, subtly different set
 * of rules for the same table.
 *
 * The one thing that pipeline cannot supply for itself is
 * `news_items.category`, a NOT NULL 4-value enum. So every report goes through
 * `extractNewsMetadata()` first — the same structural-metadata step the RSS scan
 * and the email listener use.
 *
 * `extraction_quality` rides into `rex_metadata`. A partial extraction that
 * scores 0.4 may be a 0.8 report with half its text missing, and the rubric
 * should be able to see the difference.
 */

import type { NewsCategory, ReportExtractionQuality } from '@platform/shared';
import { reportDb } from './db.js';
import { extractNewsMetadata } from '../../workflows/newsExtract.js';
import { ingestNewsItem, type IngestNewsItemResult } from '../../workflows/ingestNewsItem.js';
import { createLogger } from '../logger.js';

const log = createLogger('report-watch-feed');

/**
 * Cap on the body handed to the metadata extractor. A 200-page institutional
 * report is far past the point of diminishing returns for "what category is
 * this" — the front matter and executive summary carry the classification.
 */
const EXTRACT_CHAR_LIMIT = 24_000;

/** Fallback category when the extractor fails outright. See below. */
const FALLBACK_CATEGORY: NewsCategory = 'international';

export interface ToNewsItemInput {
  reportId: string;
  sourceId: string;
  sourceName: string;
  sourceTier: string | null;
  title: string;
  body: string;
  url: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  fileFormat: 'pdf' | 'html';
  pageCount: number | null;
  wordCount: number;
  extractionQuality: ReportExtractionQuality;
  routineId: string | null;
}

export interface ToNewsItemResult {
  newsItemId: string | null;
  relevanceScore: number | null;
  status: IngestNewsItemResult['status'];
  reason?: string;
}

/** Model scope keys, so report ingestion can be tuned separately in /settings/models. */
export const REPORT_EXTRACT_SCOPE = 'report_watch.metadata_extract';
export const REPORT_RUBRIC_SCOPE = 'report_watch.rubric_score';

export async function reportToNewsItem(input: ToNewsItemInput): Promise<ToNewsItemResult> {
  const excerpt = input.body.slice(0, EXTRACT_CHAR_LIMIT);

  const { data: extracted, reason } = await extractNewsMetadata({
    title: input.title,
    source: input.sourceName,
    content: excerpt,
    scopeKey: REPORT_EXTRACT_SCOPE,
  });

  // A failed extraction is not a reason to drop the report: it is still a real
  // artefact BTS now holds. It lands with status 'extraction_failed' and a
  // placeholder category, which is exactly how the email path handles the same
  // failure — visible in the feed, flagged for a human, not silently lost.
  const category: NewsCategory = extracted?.category ?? FALLBACK_CATEGORY;

  const result = await ingestNewsItem({
    source: { id: input.sourceId, name: input.sourceName, tier: input.sourceTier },
    title: input.title,
    body: input.body,
    fallbackSummary: extracted?.summary ?? `${input.title} — ${input.sourceName}.`,
    category,
    keyPoints: extracted?.key_points ?? [],
    topicTags: extracted?.topic_tags ?? [],
    australianRelevance: extracted?.australian_relevance ?? false,
    publishedAt: input.publishedAt,
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    status: extracted ? 'new' : 'extraction_failed',
    // has_pdf_attachment is the feed's existing "there is a document behind
    // this" flag; a report_watch PDF is precisely that.
    hasPdfAttachment: input.fileFormat === 'pdf',
    attachmentCount: input.fileFormat === 'pdf' ? 1 : 0,
    ingestedBy: 'rex',
    routineId: input.routineId,
    rubricScopeKey: REPORT_RUBRIC_SCOPE,
    rexMetadataExtra: {
      report_id: input.reportId,
      // The rubric reads this: a 0.4 on a partial extraction is not the same
      // claim as a 0.4 on a clean one.
      extraction_quality: input.extractionQuality,
      file_format: input.fileFormat,
      page_count: input.pageCount,
      word_count: input.wordCount,
      ...(extracted ? {} : { metadata_extraction_failed: reason ?? 'unknown' }),
    },
  });

  if (result.status !== 'inserted' || !result.newsItemId) {
    log.info(
      { reportId: input.reportId, status: result.status, reason: result.reason },
      'report not inserted into feed',
    );
    return {
      newsItemId: null,
      relevanceScore: null,
      status: result.status,
      reason: result.reason,
    };
  }

  // Link both directions. reports.news_item_id drives the detail page's
  // "see in feed"; news_items.report_id drives the report treatment in the card.
  const [{ error: reportError }, { error: itemError }] = await Promise.all([
    reportDb.from('reports').update({ news_item_id: result.newsItemId }).eq('id', input.reportId),
    reportDb.from('news_items').update({ report_id: input.reportId }).eq('id', result.newsItemId),
  ]);
  if (reportError) log.error({ err: reportError, reportId: input.reportId }, 'report link failed');
  if (itemError) log.error({ err: itemError, newsItemId: result.newsItemId }, 'news item link failed');

  return {
    newsItemId: result.newsItemId,
    relevanceScore: result.relevanceScore ?? null,
    status: result.status,
  };
}
