/**
 * OCR fallback, via LlamaParse.
 *
 * The ONLY cost-bearing step in this feature, and it is gated three ways:
 *
 *   1. `news_sources.ocr_enabled` — off by default. Nothing spends money
 *      silently (the Deepgram toggle convention).
 *   2. The quality gate — OCR is reached only for pages the deterministic text
 *      layer could not read. A digitally typeset PDF never gets here.
 *   3. `news_sources.ocr_page_limit` — a per-document page cap, default 40.
 *      Pages beyond the cap are recorded as empty WITH A NOTE rather than
 *      silently dropped: a half-read document that looks whole is worse than
 *      one that admits what it missed.
 *
 * LlamaParse is a cloud API with plain API-key auth. It parses the whole
 * document rather than a page range, so the cap is applied to the RESULT: the
 * request is the same either way, and truncating the output is the honest way
 * to respect a limit the vendor does not expose.
 */

import { createLogger } from '../../logger.js';

const log = createLogger('report-watch-ocr');

const BASE_URL = 'https://api.cloud.llamaindex.ai/api/v1/parsing';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60;         // 5 minutes — a 40-page scan is minutes, not hours
const REQUEST_TIMEOUT_MS = 60_000;

export interface OcrResult {
  ok: true;
  /** One entry per page, in order, capped at `pageLimit`. */
  pages: string[];
  /** How many pages OCR actually returned text for. */
  ocrPages: number;
  /** True when the document was longer than the cap. */
  truncated: boolean;
}

export type OcrOutcome = OcrResult | { ok: false; message: string };

/** Placeholder for pages past the cap. Visible in the body, and searchable. */
export const OCR_TRUNCATION_NOTE =
  '_[Page beyond the configured OCR page limit — not extracted.]_';

function apiKey(): string | undefined {
  return process.env['LLAMA_CLOUD_API_KEY']?.trim() || undefined;
}

async function post(path: string, body: FormData, key: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function get(path: string, key: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * OCR a PDF's bytes into per-page markdown.
 *
 * Never throws. A vendor outage must leave the report with its (poor) text
 * layer and a `needs_review` flag, not abort the sweep.
 */
export async function ocrPdf(
  bytes: Uint8Array,
  fileName: string,
  pageLimit: number,
): Promise<OcrOutcome> {
  const key = apiKey();
  if (!key) return { ok: false, message: 'LLAMA_CLOUD_API_KEY is not configured' };

  try {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      fileName || 'report.pdf',
    );
    // Scanned institutional reports are the whole reason this rung exists;
    // asking for markdown keeps headings, which the chunker uses for
    // `heading_path`.
    form.append('result_type', 'markdown');

    const uploadRes = await post('/upload', form, key);
    if (!uploadRes.ok) {
      return { ok: false, message: `LlamaParse upload failed: HTTP ${uploadRes.status}` };
    }
    const uploaded = (await uploadRes.json()) as { id?: string; status?: string };
    const jobId = uploaded.id;
    if (!jobId) return { ok: false, message: 'LlamaParse upload returned no job id' };

    // ── poll ────────────────────────────────────────────────────────────────
    let status = uploaded.status ?? 'PENDING';
    for (let i = 0; i < MAX_POLLS && status !== 'SUCCESS'; i += 1) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await get(`/job/${jobId}`, key);
      if (!statusRes.ok) {
        return { ok: false, message: `LlamaParse status failed: HTTP ${statusRes.status}` };
      }
      const job = (await statusRes.json()) as { status?: string; error_message?: string };
      status = job.status ?? 'PENDING';
      if (status === 'ERROR' || status === 'CANCELED') {
        return { ok: false, message: `LlamaParse job ${status}: ${job.error_message ?? 'no detail'}` };
      }
    }
    if (status !== 'SUCCESS') {
      return { ok: false, message: 'LlamaParse job did not complete within the poll window' };
    }

    const resultRes = await get(`/job/${jobId}/result/markdown`, key);
    if (!resultRes.ok) {
      return { ok: false, message: `LlamaParse result failed: HTTP ${resultRes.status}` };
    }
    const result = (await resultRes.json()) as {
      pages?: Array<{ page?: number; md?: string; text?: string }>;
      markdown?: string;
    };

    let pages: string[];
    if (Array.isArray(result.pages) && result.pages.length > 0) {
      pages = result.pages.map((p) => (p.md ?? p.text ?? '').trim());
    } else if (typeof result.markdown === 'string') {
      // Whole-document markdown with no page breakdown: one "page" is the
      // honest representation — inventing page boundaries would produce
      // citations that point nowhere.
      pages = [result.markdown.trim()];
    } else {
      return { ok: false, message: 'LlamaParse returned no recognisable markdown' };
    }

    const truncated = pages.length > pageLimit;
    const kept = truncated ? pages.slice(0, pageLimit) : pages;
    if (truncated) {
      log.warn({ pages: pages.length, pageLimit }, 'ocr result truncated at page limit');
      // Recorded, not dropped. The body says what it does not contain.
      kept.push(OCR_TRUNCATION_NOTE);
    }

    return {
      ok: true,
      pages: kept,
      ocrPages: kept.filter((p) => p && p !== OCR_TRUNCATION_NOTE).length,
      truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err }, 'ocr failed');
    return { ok: false, message };
  }
}
