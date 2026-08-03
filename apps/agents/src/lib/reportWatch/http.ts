/**
 * Outbound fetch for report discovery and acquisition.
 *
 * Separate from lib/ecosystem/http.ts for two reasons that matter: this one has
 * to fetch BINARY bodies (a 30MB PDF, not a JSON payload), and it has to issue
 * HEAD requests whose headers are the whole point. The ecosystem helper returns
 * `body: string` and drops the response headers, so reusing it would mean
 * downloading every artefact just to learn its size.
 *
 * Being a well-behaved crawler is cheaper than being blocked: every request
 * carries an identified user agent with a contact URL, and the byte caps are
 * enforced before the body is read, not after.
 */

import type { ReportAdapterError } from './types.js';

const TEXT_TIMEOUT_MS = 20_000;
const BYTES_TIMEOUT_MS = 120_000;   // a 40MB institutional PDF on a slow CDN
const MAX_TEXT_BYTES = 5_000_000;   // index pages and sitemaps only
export const MAX_ARTEFACT_BYTES = 50_000_000;

export const REPORT_USER_AGENT =
  'BTSReportWatch/1.0 (+https://btreasury.com.au; research archive)';

export type TextResult =
  | { ok: true; status: number; body: string; finalUrl: string }
  | { ok: false; error: ReportAdapterError };

function classify(status: number): ReportAdapterError['kind'] {
  if (status === 404 || status === 410) return 'not_found';
  if (status === 429 || status === 403) return 'rate_limit';
  return 'transport';
}

/** GET a text body (feed, sitemap, index page). Never throws. */
export async function fetchText(
  url: string,
  headers: Record<string, string> = {},
): Promise<TextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEXT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': REPORT_USER_AGENT, ...headers },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: { kind: classify(res.status), message: `HTTP ${res.status} from ${url}`, status: res.status },
      };
    }

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_TEXT_BYTES) {
      return { ok: false, error: { kind: 'transport', message: `response too large (${declared} bytes)` } };
    }

    const body = await res.text();
    if (body.length > MAX_TEXT_BYTES) {
      return { ok: false, error: { kind: 'transport', message: 'response exceeded byte cap' } };
    }

    return { ok: true, status: res.status, body, finalUrl: res.url || url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'transport', message } };
  } finally {
    clearTimeout(timer);
  }
}

export interface HeadInfo {
  status: number;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
  lastModified: string | null;
  finalUrl: string;
}

export type HeadResult =
  | { ok: true; head: HeadInfo }
  | { ok: false; error: ReportAdapterError; status?: number };

/**
 * HEAD a candidate URL. The size and content type come back before a single
 * byte of the artefact is downloaded, which is the entire point — a sitemap
 * that surfaced a 200MB video should cost one round trip, not a download.
 *
 * Some CDNs answer HEAD with 405. That is not a rejection of the artefact, so
 * the caller is told and falls through to a ranged GET rather than skipping.
 */
export async function fetchHead(
  url: string,
  headers: Record<string, string> = {},
): Promise<HeadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEXT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': REPORT_USER_AGENT, ...headers },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: { kind: classify(res.status), message: `HTTP ${res.status} from HEAD ${url}`, status: res.status },
        status: res.status,
      };
    }

    const rawLength = Number(res.headers.get('content-length'));
    return {
      ok: true,
      head: {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: Number.isFinite(rawLength) && rawLength > 0 ? rawLength : null,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        finalUrl: res.url || url,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'transport', message } };
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchedBytes {
  bytes: Uint8Array;
  contentType: string | null;
  lastModified: string | null;
  etag: string | null;
  finalUrl: string;
}

export type BytesResult =
  | { ok: true; artefact: FetchedBytes }
  | { ok: false; error: ReportAdapterError };

/**
 * GET an artefact body. The declared length is re-checked here as well as at
 * HEAD, because a server is free to answer the two differently and the cap is
 * about what lands in memory, not about what was advertised.
 */
export async function fetchBytes(
  url: string,
  maxBytes: number = MAX_ARTEFACT_BYTES,
  headers: Record<string, string> = {},
): Promise<BytesResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BYTES_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': REPORT_USER_AGENT, ...headers },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: { kind: classify(res.status), message: `HTTP ${res.status} from ${url}`, status: res.status },
      };
    }

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, error: { kind: 'transport', message: `artefact too large (${declared} bytes)` } };
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      return {
        ok: false,
        error: { kind: 'transport', message: `artefact exceeded byte cap (${buffer.byteLength} bytes)` },
      };
    }

    return {
      ok: true,
      artefact: {
        bytes: new Uint8Array(buffer),
        contentType: res.headers.get('content-type'),
        lastModified: res.headers.get('last-modified'),
        etag: res.headers.get('etag'),
        finalUrl: res.url || url,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'transport', message } };
  } finally {
    clearTimeout(timer);
  }
}

/** Politeness delay between requests to the same host. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
