/**
 * PDF text layer, via unpdf.
 *
 * The cheap, deterministic, offline first rung of the extraction waterfall. Most
 * institutional PDFs are typeset digitally and have a perfectly good text layer;
 * paying an OCR vendor to re-read them would be spending money to get a worse
 * answer.
 *
 * Pages are extracted SEPARATELY and kept separate all the way through. Page
 * boundaries are not a formatting detail here — they are the citation anchor
 * (`report_segments.page_number`), and a chunk that spans two pages cannot be
 * cited cleanly.
 */

import { extractText, getMeta } from 'unpdf';
import { createLogger } from '../../logger.js';

const log = createLogger('report-watch-pdf');

export interface PdfExtraction {
  ok: true;
  /** One entry per page, in order. Empty strings preserved — a blank page is a fact. */
  pages: string[];
  pageCount: number;
  /** From the PDF's document info dictionary, when present. */
  title: string | null;
  /** ISO date from CreationDate/ModDate, when parseable. */
  createdAt: string | null;
}

export type PdfExtractionResult = PdfExtraction | { ok: false; message: string };

/**
 * PDF dates are `D:YYYYMMDDHHmmSS±HH'mm'`. unpdf may hand back a Date when
 * `parseDates` is on, but the raw string is the common case and the format is
 * rigid enough to slice.
 */
export function parsePdfDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const m = /^D:(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
  }
  const [, y, mo, d] = m;
  // A structurally valid but nonsensical date (month 00) is worse than none:
  // it would win the published_at waterfall over a correct scraped date.
  const iso = `${y}-${mo}-${d}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title) return null;
  // Producers routinely leave the source filename or a template name in the
  // Title field. Neither is a report title, and both read badly in the feed.
  if (/^(untitled|microsoft word|document\d*|slide\d*)/i.test(title)) return null;
  if (/\.(docx?|pptx?|indd|pdf)$/i.test(title)) return null;
  return title;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtractionResult> {
  try {
    // A fresh copy: pdf.js transfers/detaches the buffer it is handed, and the
    // caller still needs these bytes for the content hash and OCR upload.
    const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: false });

    let title: string | null = null;
    let createdAt: string | null = null;
    try {
      const { info } = await getMeta(new Uint8Array(bytes));
      title = cleanTitle(info?.Title);
      createdAt = parsePdfDate(info?.CreationDate) ?? parsePdfDate(info?.ModDate);
    } catch (err) {
      // Missing/corrupt metadata is not an extraction failure — the text is the
      // thing, and the title falls through to the next source.
      log.warn({ err }, 'pdf metadata unreadable');
    }

    return {
      ok: true,
      pages: (text as string[]).map((p) => (p ?? '').trim()),
      pageCount: totalPages,
      title,
      createdAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err }, 'pdf text layer extraction failed');
    return { ok: false, message };
  }
}
