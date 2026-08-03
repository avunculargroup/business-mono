/**
 * The extraction waterfall.
 *
 *   PDF ──> text layer (unpdf)  ──> quality gate ──┬─> good enough: done
 *                                                  └─> OCR (LlamaParse), if the
 *                                                      source opted in
 *   HTML ─> Jina Reader → markdown (Turndown fallback)
 *
 * This also closes a deferral from the Research Feed spec: PDF attachment
 * extraction, flagged v2 at the time. A PDF arriving by email from Fidelity and
 * a PDF discovered on River's reports index run through exactly these steps once
 * acquired, which is why the entry point takes bytes rather than a candidate row.
 *
 * OCR merges page-for-page rather than replacing the whole document: pages the
 * text layer read correctly keep their (better, cheaper) text, and only the
 * pages that failed are substituted. A scanned appendix bolted onto a digital
 * report is common, and re-OCR-ing the good pages would spend money to lose
 * fidelity.
 */

import type { ReportExtractionMethod } from '@platform/shared';
import { assessExtraction, countWords, type QualityAssessment } from '../assessQuality.js';
import { extractPdfText } from './pdfText.js';
import { ocrPdf, OCR_TRUNCATION_NOTE } from './ocr.js';
import { extractHtml } from './html.js';
import { createLogger } from '../../logger.js';

const log = createLogger('report-watch-extract');

export interface ExtractionInput {
  bytes: Uint8Array;
  fileFormat: 'pdf' | 'html';
  fileName: string;
  /** The artefact URL — Jina Reader needs it, and it is the HTML title fallback. */
  url: string;
  ocrEnabled: boolean;
  ocrPageLimit: number;
}

export interface ExtractionOutput {
  /** Per-page text, in order. Exactly one entry for HTML. */
  pages: string[];
  /** Full body markdown, with page markers for PDFs. */
  body: string;
  pageCount: number | null;
  wordCount: number;
  method: ReportExtractionMethod;
  quality: QualityAssessment['quality'];
  metrics: QualityAssessment['metrics'];
  ocrUsed: boolean;
  /** Title from PDF metadata / first heading, when one was found. */
  titleHint: string | null;
  /** Creation date from PDF metadata, when parseable. */
  publishedAtHint: string | null;
  /** Set when extraction produced nothing usable at all. */
  error: string | null;
}

/**
 * Page markers as light dividers, so the detail page can render page boundaries
 * and a reader can find the page a citation refers to. Only for PDFs — a
 * single-page HTML document with a `--- p. 1 ---` header would be noise.
 */
export function joinPages(pages: string[], format: 'pdf' | 'html'): string {
  if (format === 'html') return pages.join('\n\n').trim();
  return pages
    .map((page, i) => `\n\n---\n\n**p. ${i + 1}**\n\n${page}`.trimEnd())
    .join('')
    .trim();
}

/** The failure shape — a stored artefact with no readable text. */
function failed(message: string, pageCount: number | null): ExtractionOutput {
  return {
    pages: [],
    body: '',
    pageCount,
    wordCount: 0,
    method: 'pdf_text_layer',
    quality: 'failed',
    metrics: { chars_per_page: 0, alpha_ratio: 0, empty_page_count: 0, ocr_pages: 0, page_count: pageCount ?? 0 },
    ocrUsed: false,
    titleHint: null,
    publishedAtHint: null,
    error: message,
  };
}

export async function extractReport(input: ExtractionInput): Promise<ExtractionOutput> {
  return input.fileFormat === 'html' ? extractHtmlReport(input) : extractPdfReport(input);
}

async function extractHtmlReport(input: ExtractionInput): Promise<ExtractionOutput> {
  const html = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
  const result = await extractHtml(input.url, html);
  if (!result.ok) return failed(result.message, null);

  const assessment = assessExtraction(result.pages);
  const body = joinPages(result.pages, 'html');

  return {
    pages: result.pages,
    body,
    pageCount: null,          // HTML has no pages; the column stays NULL
    wordCount: countWords(body),
    method: 'html_jina',
    quality: assessment.quality,
    metrics: assessment.metrics,
    ocrUsed: false,
    titleHint: result.title,
    publishedAtHint: null,
    error: null,
  };
}

async function extractPdfReport(input: ExtractionInput): Promise<ExtractionOutput> {
  const layer = await extractPdfText(input.bytes);
  if (!layer.ok) {
    // A PDF whose text layer cannot even be opened is still an OCR candidate —
    // that is precisely the scanned-document case — but only if the source is
    // paying for it.
    if (!input.ocrEnabled) return failed(layer.message, null);
    return ocrOnly(input, layer.message);
  }

  const first = assessExtraction(layer.pages);

  // Good enough: stop. The cheap deterministic path won, which is the common
  // case for digitally typeset institutional reports.
  if (first.quality === 'good' || !input.ocrEnabled || first.badPages.length === 0) {
    const body = joinPages(layer.pages, 'pdf');
    return {
      pages: layer.pages,
      body,
      pageCount: layer.pageCount,
      wordCount: countWords(body),
      method: 'pdf_text_layer',
      quality: first.quality,
      metrics: first.metrics,
      ocrUsed: false,
      titleHint: layer.title,
      publishedAtHint: layer.createdAt,
      error: null,
    };
  }

  // ── OCR the pages the text layer could not read ────────────────────────────
  log.info(
    { badPages: first.badPages.length, pageCount: layer.pageCount },
    'text layer insufficient — falling back to ocr',
  );

  const ocr = await ocrPdf(input.bytes, input.fileName, input.ocrPageLimit);
  if (!ocr.ok) {
    // OCR failed. Keep what the text layer gave us and let the (poor) quality
    // verdict stand — the report is still worth knowing about.
    log.warn({ reason: ocr.message }, 'ocr fallback failed — keeping text layer');
    const body = joinPages(layer.pages, 'pdf');
    return {
      pages: layer.pages,
      body,
      pageCount: layer.pageCount,
      wordCount: countWords(body),
      method: 'pdf_text_layer',
      quality: first.quality,
      metrics: first.metrics,
      ocrUsed: false,
      titleHint: layer.title,
      publishedAtHint: layer.createdAt,
      error: null,
    };
  }

  // Page-for-page merge, keeping the better text on pages that already read
  // well. Guarded on index because OCR page counts can differ from the text
  // layer's (a vendor that returns whole-document markdown yields one page).
  const bad = new Set(first.badPages);
  const merged = layer.pages.map((page, i) =>
    bad.has(i) && ocr.pages[i] ? ocr.pages[i] : page,
  );
  // Anything OCR returned beyond the text layer's page count (including the
  // truncation note) is appended rather than discarded.
  if (ocr.pages.length > merged.length) merged.push(...ocr.pages.slice(merged.length));

  const ocrPageCount = merged.filter((_, i) => bad.has(i) && ocr.pages[i]).length;
  const second = assessExtraction(
    merged.filter((p) => p !== OCR_TRUNCATION_NOTE),
    ocrPageCount,
  );
  const body = joinPages(merged, 'pdf');

  return {
    pages: merged,
    body,
    pageCount: layer.pageCount,
    wordCount: countWords(body),
    method: ocrPageCount > 0 ? 'ocr' : 'pdf_text_layer',
    quality: second.quality,
    metrics: second.metrics,
    ocrUsed: ocrPageCount > 0,
    titleHint: layer.title,
    publishedAtHint: layer.createdAt,
    error: null,
  };
}

/** The text layer would not open at all — OCR is the only remaining rung. */
async function ocrOnly(input: ExtractionInput, layerError: string): Promise<ExtractionOutput> {
  const ocr = await ocrPdf(input.bytes, input.fileName, input.ocrPageLimit);
  if (!ocr.ok) return failed(`${layerError}; ocr: ${ocr.message}`, null);

  const assessment = assessExtraction(
    ocr.pages.filter((p) => p !== OCR_TRUNCATION_NOTE),
    ocr.ocrPages,
  );
  const body = joinPages(ocr.pages, 'pdf');

  return {
    pages: ocr.pages,
    body,
    pageCount: ocr.pages.length,
    wordCount: countWords(body),
    method: 'ocr',
    quality: assessment.quality,
    metrics: assessment.metrics,
    ocrUsed: true,
    titleHint: null,
    publishedAtHint: null,
    error: null,
  };
}
