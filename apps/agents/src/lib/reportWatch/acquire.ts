/**
 * Acquisition — turn a candidate URL into stored bytes, or a recorded reason
 * why not.
 *
 * The order of operations here is the point:
 *
 *   robots  →  HEAD  →  (one hop, if configured)  →  GET  →  sha256  →  dedupe  →  upload
 *
 * Everything cheap that can reject a candidate runs before anything expensive.
 * A 200MB video that a sitemap surfaced costs one HEAD, not a download; a PDF
 * the publisher moved to a new path costs a download and a hash, but no
 * extraction, no embedding and no LLM call.
 *
 * The hash is computed BEFORE anything else touches the bytes, and the storage
 * path is keyed by it — `reports/{source-slug}/{yyyy}/{content_hash}.{ext}` —
 * so the path is inherently immutable. Two candidates that resolve to identical
 * bytes cannot produce two different stored objects.
 */

import * as cheerio from 'cheerio';
import { reportDb } from './db.js';
import { createLogger } from '../logger.js';
import {
  fetchHead,
  fetchBytes,
  fetchText,
  sleep,
  MAX_ARTEFACT_BYTES,
  type HeadInfo,
} from './http.js';
import { contentHash, fileNameFromUrl, normalizeReportUrl } from './normalize.js';
import type { RobotsCache } from './robots.js';
import type { ReportSkipReason } from '@platform/shared';

const log = createLogger('report-watch-acquire');

const STORAGE_BUCKET = 'reports';

/** Content types we can extract. Anything else is a deliberate skip. */
const PDF_TYPES = ['application/pdf', 'application/x-pdf'];
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];

export interface AcquisitionInput {
  candidateId: string;
  /** The normalised candidate URL. */
  url: string;
  /** Set when the index page linked a landing page and `follow_to_pdf` is on. */
  landingUrl: string | null;
  sourceId: string;
  sourceName: string;
  crawlDelaySeconds: number;
  /** Selector for the artefact link on a followed landing page. */
  pdfLinkSelector: string | undefined;
}

export type AcquisitionResult =
  /** Bytes stored (or already stored) and ready for extraction. */
  | {
      outcome: 'acquired';
      artefact: {
        url: string;
        canonicalUrl: string | null;
        bytes: Uint8Array;
        contentHash: string;
        fileFormat: 'pdf' | 'html';
        fileName: string;
        fileSizeBytes: number;
        storagePath: string;
        lastModified: string | null;
      };
      head: Partial<HeadInfo>;
    }
  /** Byte-identical to a report we already hold. */
  | { outcome: 'duplicate'; reportId: string; contentHash: string; head: Partial<HeadInfo> }
  /** A decision we would make again. Terminal. */
  | { outcome: 'skipped'; reason: ReportSkipReason; head: Partial<HeadInfo> }
  /** Transient. The caller decides whether the retry budget is spent. */
  | { outcome: 'failed'; message: string; head: Partial<HeadInfo> };

function matchesType(contentType: string | null, types: string[]): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0]!.trim().toLowerCase();
  return types.includes(base);
}

/** PDF magic number. A publisher serving `application/octet-stream` is common. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Filesystem-safe slug for the storage path. */
export function sourceSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'source';
}

/**
 * `reports/{source-slug}/{yyyy}/{hash}.{ext}`.
 *
 * Keyed by hash rather than filename so the path is inherently immutable: a
 * revised document gets a different hash and therefore a different object, and
 * the version BTS actually read is never overwritten.
 */
export function storagePathFor(
  sourceName: string,
  hash: string,
  ext: 'pdf' | 'html',
  now: Date = new Date(),
): string {
  return `${sourceSlug(sourceName)}/${now.getUTCFullYear()}/${hash}.${ext}`;
}

/**
 * Follow exactly one hop from a landing page to the artefact. No more: a second
 * hop is how a report watch quietly becomes a site crawler.
 */
async function followToArtefact(
  landingUrl: string,
  pdfLinkSelector: string | undefined,
): Promise<string | null> {
  const page = await fetchText(landingUrl, { Accept: 'text/html,application/xhtml+xml' });
  if (!page.ok) return null;

  try {
    const $ = cheerio.load(page.body);
    const href = $(pdfLinkSelector?.trim() || "a[href$='.pdf']").first().attr('href');
    if (!href) return null;
    return normalizeReportUrl(href, page.finalUrl ?? landingUrl);
  } catch {
    return null;
  }
}

/**
 * Acquire one candidate.
 *
 * Never throws: one publisher's TLS misconfiguration must not abort the sweep
 * for the other nine.
 */
export async function acquireCandidate(
  input: AcquisitionInput,
  robots: RobotsCache,
  now: Date = new Date(),
): Promise<AcquisitionResult> {
  try {
    return await acquire(input, robots, now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, candidateId: input.candidateId }, 'acquisition threw');
    return { outcome: 'failed', message, head: {} };
  }
}

async function acquire(
  input: AcquisitionInput,
  robots: RobotsCache,
  now: Date,
): Promise<AcquisitionResult> {
  const delayMs = Math.max(0, input.crawlDelaySeconds) * 1000;

  // ── robots.txt ─────────────────────────────────────────────────────────────
  if (!(await robots.isAllowed(input.url))) {
    return { outcome: 'skipped', reason: 'robots_disallowed', head: {} };
  }

  // ── one-hop follow ─────────────────────────────────────────────────────────
  // Done before HEAD because the landing page's own headers say nothing useful
  // about the artefact behind it.
  let targetUrl = input.url;
  let canonicalUrl: string | null = null;
  if (input.landingUrl) {
    await sleep(delayMs);
    const artefactUrl = await followToArtefact(input.landingUrl, input.pdfLinkSelector);
    if (artefactUrl) {
      canonicalUrl = input.landingUrl;
      targetUrl = artefactUrl;
      if (!(await robots.isAllowed(targetUrl))) {
        return { outcome: 'skipped', reason: 'robots_disallowed', head: {} };
      }
    }
    // No PDF behind the hop: fall through and treat the landing page itself as
    // the artefact. An HTML research note is a perfectly good report.
  }

  // ── HEAD ───────────────────────────────────────────────────────────────────
  await sleep(Math.max(delayMs, (robots.crawlDelay(targetUrl) ?? 0) * 1000));
  const headResult = await fetchHead(targetUrl);

  let head: Partial<HeadInfo> = {};
  if (headResult.ok) {
    head = headResult.head;

    if (head.contentLength && head.contentLength > MAX_ARTEFACT_BYTES) {
      return { outcome: 'skipped', reason: 'too_large', head };
    }

    const isPdf = matchesType(head.contentType ?? null, PDF_TYPES);
    const isHtml = matchesType(head.contentType ?? null, HTML_TYPES);
    const isOctet = matchesType(head.contentType ?? null, ['application/octet-stream', 'binary/octet-stream']);
    // octet-stream is ambiguous rather than wrong — plenty of CDNs serve PDFs
    // that way — so it survives to the magic-number check after download.
    if (head.contentType && !isPdf && !isHtml && !isOctet) {
      return { outcome: 'skipped', reason: 'wrong_content_type', head };
    }
  } else if (headResult.status && headResult.status !== 405 && headResult.status !== 501) {
    // A 405/501 is the server refusing HEAD, not refusing the artefact.
    return { outcome: 'failed', message: headResult.error.message, head: { status: headResult.status } };
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  await sleep(delayMs);
  const bytesResult = await fetchBytes(targetUrl);
  if (!bytesResult.ok) {
    return { outcome: 'failed', message: bytesResult.error.message, head };
  }

  const { bytes, contentType, lastModified, finalUrl } = bytesResult.artefact;
  const isPdf = looksLikePdf(bytes) || matchesType(contentType, PDF_TYPES);
  const isHtml = !isPdf && matchesType(contentType, HTML_TYPES);
  if (!isPdf && !isHtml) {
    return { outcome: 'skipped', reason: 'wrong_content_type', head: { ...head, contentType } };
  }
  const fileFormat: 'pdf' | 'html' = isPdf ? 'pdf' : 'html';

  // ── hash first ─────────────────────────────────────────────────────────────
  // Before storage, before extraction. A hash collision with an existing report
  // ends the branch: that is the publisher-moved-a-PDF case, and no further
  // work is warranted.
  const hash = contentHash(bytes);
  const { data: existing } = await reportDb
    .from('reports')
    .select<{ id: string }>('id')
    .eq('content_hash', hash)
    .maybeSingle();
  const existingId = existing?.id;
  if (existingId) {
    return { outcome: 'duplicate', reportId: existingId, contentHash: hash, head };
  }

  // ── upload ─────────────────────────────────────────────────────────────────
  const storagePath = storagePathFor(input.sourceName, hash, fileFormat, now);
  const { error: uploadError } = await reportDb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: fileFormat === 'pdf' ? 'application/pdf' : 'text/html',
      // The path is the content hash, so an object already there IS this
      // artefact. Overwriting it changes nothing and re-uploading is free to
      // skip — but a stale partial upload should be replaced, so upsert.
      upsert: true,
    });

  if (uploadError) {
    return { outcome: 'failed', message: `storage upload failed: ${uploadError.message}`, head };
  }

  return {
    outcome: 'acquired',
    artefact: {
      url: finalUrl || targetUrl,
      canonicalUrl,
      bytes,
      contentHash: hash,
      fileFormat,
      fileName: fileNameFromUrl(targetUrl, fileFormat),
      fileSizeBytes: bytes.byteLength,
      storagePath,
      lastModified: lastModified ?? head.lastModified ?? null,
    },
    head: { ...head, contentType },
  };
}
