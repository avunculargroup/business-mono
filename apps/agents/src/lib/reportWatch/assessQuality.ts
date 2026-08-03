/**
 * Extraction quality assessment.
 *
 * Arithmetic, not judgement. Nothing in this file calls a model, and nothing in
 * it should: "did the text layer come out" is a measurable property of the
 * bytes, and asking an LLM would make it expensive, slow and non-reproducible
 * in exchange for nothing.
 *
 * The two thresholds are what separate a real page from a scanned image with a
 * few stray ligatures on it:
 *
 *   chars_per_page < 100  — a page of an institutional report has hundreds of
 *                           characters. Under a hundred is a cover, a full-page
 *                           chart, or a scan with no text layer.
 *   alpha_ratio    < 0.6  — a garbled text layer (bad CMap, subset font with no
 *                           ToUnicode) comes out as punctuation and control
 *                           soup. Real prose is overwhelmingly letters.
 *
 * The verdict feeds two gates: the publish wall on `report_segments`, and Rex's
 * payload. A partial extraction that scores 0.4 may be a 0.8 report with half
 * its text missing, and the rubric should be able to see the difference.
 */

import type { ReportExtractionQuality, ReportExtractionMetrics } from '@platform/shared';

export const MIN_CHARS_PER_PAGE = 100;
export const MIN_ALPHA_RATIO = 0.6;

/** Fraction of characters that are letters, ignoring whitespace. */
export function alphaRatio(text: string): number {
  const meaningful = text.replace(/\s+/g, '');
  if (meaningful.length === 0) return 0;
  const letters = meaningful.replace(/[^\p{L}]/gu, '').length;
  return letters / meaningful.length;
}

/** Whether one page's extracted text clears both thresholds. */
export function pageIsGood(text: string): boolean {
  const chars = text.replace(/\s+/g, '').length;
  if (chars < MIN_CHARS_PER_PAGE) return false;
  return alphaRatio(text) >= MIN_ALPHA_RATIO;
}

export interface QualityAssessment {
  quality: ReportExtractionQuality;
  metrics: ReportExtractionMetrics;
  /** Zero-based indices of pages that failed the gate — what OCR is offered. */
  badPages: number[];
}

/**
 * Assess a page-by-page extraction.
 *
 *   good    — every page cleared both thresholds
 *   partial — some pages failed
 *   failed  — the majority failed
 *
 * A `failed` extraction is NOT a dead end: it still produces a stored artefact
 * and a feed item marked `needs_review`. A report BTS knows exists but cannot
 * read is more useful than one it never noticed.
 */
export function assessExtraction(pages: string[], ocrPages = 0): QualityAssessment {
  const pageCount = pages.length;
  if (pageCount === 0) {
    return {
      quality: 'failed',
      metrics: { chars_per_page: 0, alpha_ratio: 0, empty_page_count: 0, ocr_pages: ocrPages, page_count: 0 },
      badPages: [],
    };
  }

  const joined = pages.join('\n');
  const totalChars = joined.replace(/\s+/g, '').length;

  const badPages: number[] = [];
  let emptyPages = 0;
  pages.forEach((page, i) => {
    if (page.trim().length === 0) emptyPages += 1;
    if (!pageIsGood(page)) badPages.push(i);
  });

  const metrics: ReportExtractionMetrics = {
    chars_per_page: Math.round(totalChars / pageCount),
    alpha_ratio: Number(alphaRatio(joined).toFixed(3)),
    empty_page_count: emptyPages,
    ocr_pages: ocrPages,
    page_count: pageCount,
  };

  let quality: ReportExtractionQuality;
  if (badPages.length === 0) quality = 'good';
  else if (badPages.length * 2 > pageCount) quality = 'failed';
  else quality = 'partial';

  return { quality, metrics, badPages };
}

/** Words in the extracted body — the `reports.word_count` column. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
