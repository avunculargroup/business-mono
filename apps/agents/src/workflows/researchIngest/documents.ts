/**
 * Document resolution and retrieval.
 *
 * Document acquisition is the binding constraint on this feature, not
 * discovery. Every investor-relations page encountered while researching the
 * three seed records — the companies' own announcement pages, two third-party
 * aggregators — is a client-rendered widget that returns navigation chrome and
 * empty carousels to a fetcher. The two paths that yielded everything were
 * direct links to a PDF: one on a data API, one a static file on a company's
 * own document directory.
 *
 * So this layer resolves a registered document to a concrete URL and fetches
 * the file whole, independent of whatever renders the index page. It does not
 * discover documents. Documents are registered in `research_documents` by the
 * hand-curation pass, and this turns a registration into bytes.
 *
 * ## Why there are no built-in announcement URL templates
 *
 * An obvious design is a per-venue template — announcement id in, PDF URL out.
 * None is shipped, because none has been verified against the venues, and a
 * template guessed from training data produces a URL that 404s convincingly and
 * fills `retrieval_error` with a fiction. A venue template is configuration
 * (`RESEARCH_PDF_BASE_<VENUE>`), and a document at a venue with no configured
 * base resolves as `unresolved` rather than being sent to a fabricated address.
 * A document that carries its own `pdf_url` — which every hand-entered one does
 * — needs no template at all.
 *
 * HTTP, byte caps, the identified user agent and PDF text extraction are reused
 * from `lib/reportWatch/`, which already solved all four for a fetcher with the
 * same shape.
 */

import { createHash } from 'crypto';
import { fetchBytes, sleep } from '../../lib/reportWatch/http.js';
import { extractPdfText } from '../../lib/reportWatch/extract/pdfText.js';
import { extractHtml } from '../../lib/reportWatch/extract/html.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('research-ingest-documents');

/** One request per host per two seconds. Being a well-behaved crawler is cheaper than being blocked. */
export const HOST_DELAY_MS = 2000;

/** A registered document, as `research_documents` holds it. */
export interface DocumentRow {
  id: string;
  venue: string | null;
  announcement_id: string | null;
  pdf_url: string | null;
  title: string;
  content_sha256: string | null;
}

export type DocumentRef =
  | { id: string; title: string; url: string; knownSha: string | null; status: 'resolved' }
  | { id: string; title: string; url: null; knownSha: string | null; status: 'unresolved'; reason: string };

/**
 * Where a venue's announcement PDFs live, from the environment.
 *
 * `RESEARCH_PDF_BASE_ASX=https://…/{id}.pdf` — `{id}` is substituted with the
 * announcement id. Unset means unresolved, which is the honest answer.
 */
export function venueBase(venue: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return env[`RESEARCH_PDF_BASE_${venue.toUpperCase()}`] ?? null;
}

/**
 * Turns registered documents into fetchable references.
 *
 * Pure, so the resolution rules are testable without a database or a network:
 * a direct URL wins, a venue template is used where one is configured, and
 * anything else is reported unresolved with the reason.
 */
export function resolveDocuments(
  rows: readonly DocumentRow[],
  env: NodeJS.ProcessEnv = process.env,
): DocumentRef[] {
  return rows.map((row): DocumentRef => {
    const base = { id: row.id, title: row.title, knownSha: row.content_sha256 };

    // A direct link is what actually worked in every case, so it wins outright.
    if (row.pdf_url) return { ...base, url: row.pdf_url, status: 'resolved' };

    if (!row.venue || !row.announcement_id) {
      return {
        ...base,
        url: null,
        status: 'unresolved',
        reason: 'no pdf_url, and no venue plus announcement id to resolve one from',
      };
    }

    const template = venueBase(row.venue, env);
    if (!template) {
      return {
        ...base,
        url: null,
        status: 'unresolved',
        reason:
          `no RESEARCH_PDF_BASE_${row.venue.toUpperCase()} configured; ` +
          'refusing to guess an announcement URL',
      };
    }

    return {
      ...base,
      url: template.replace('{id}', encodeURIComponent(row.announcement_id)),
      status: 'resolved',
    };
  });
}

export type FetchOutcome =
  /** Bytes changed and text was extracted. */
  | { kind: 'fetched'; documentId: string; sha256: string; text: string; pageCount: number | null }
  /** The content hash matched what is already stored. Nothing downloaded twice. */
  | { kind: 'unchanged'; documentId: string; sha256: string }
  /** The attempt failed and is recorded. A document that 404s repeatedly is a signal. */
  | { kind: 'failed'; documentId: string; error: string };

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/**
 * Fetches one document.
 *
 * Never throws. A failed fetch is an outcome to record, not an exception that
 * aborts the run — one company's redesigned site must not stop the other
 * nineteen, and a repeated failure is itself the finding.
 */
export async function fetchDocument(ref: DocumentRef): Promise<FetchOutcome> {
  if (ref.status === 'unresolved') {
    return { kind: 'failed', documentId: ref.id, error: `unresolved: ${ref.reason}` };
  }

  const result = await fetchBytes(ref.url);
  if (!result.ok) {
    log.warn({ documentId: ref.id, reason: result.error.kind }, 'document fetch failed');
    return { kind: 'failed', documentId: ref.id, error: `${result.error.kind}: ${result.error.message}` };
  }

  const digest = sha256(result.artefact.bytes);
  // The dedupe. An unchanged document costs one request and no extraction,
  // which is what makes re-running the workflow over the same documents cheap
  // as well as idempotent.
  if (ref.knownSha && ref.knownSha === digest) {
    return { kind: 'unchanged', documentId: ref.id, sha256: digest };
  }

  if (looksLikePdf(result.artefact.bytes)) {
    const extracted = await extractPdfText(result.artefact.bytes);
    if (!extracted.ok) {
      return { kind: 'failed', documentId: ref.id, error: `pdf extraction: ${extracted.message}` };
    }
    return {
      kind: 'fetched',
      documentId: ref.id,
      sha256: digest,
      // Pages joined, never kept as sections. One issuer disclosed its
      // accounting election under a heading about accounting treatment inside
      // the risk factors, and four rounds of searching the financial
      // statements missed it. Retrieval is by field semantics over the whole
      // document, so the whole document is what gets stored.
      text: extracted.pages.join('\n\n'),
      pageCount: extracted.pageCount,
    };
  }

  const html = new TextDecoder().decode(result.artefact.bytes);
  const extracted = await extractHtml(ref.url, html);
  if (!extracted.ok) {
    return { kind: 'failed', documentId: ref.id, error: `html extraction: ${extracted.message}` };
  }
  return {
    kind: 'fetched',
    documentId: ref.id,
    sha256: digest,
    text: extracted.pages.join('\n\n'),
    pageCount: null,
  };
}

/** Groups refs by host so the politeness delay is per host rather than global. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Fetches every reference, one host at a time, pausing between requests to the
 * same host. Hosts run in parallel — the delay is a politeness rule about one
 * server, not a global throttle that would make a twenty-company sweep take an
 * hour.
 */
export async function fetchAll(refs: readonly DocumentRef[]): Promise<FetchOutcome[]> {
  const byHost = new Map<string, DocumentRef[]>();
  for (const ref of refs) {
    const host = ref.status === 'resolved' ? hostOf(ref.url) : '';
    const bucket = byHost.get(host);
    if (bucket) bucket.push(ref);
    else byHost.set(host, [ref]);
  }

  const perHost = await Promise.all(
    [...byHost.values()].map(async (group) => {
      const outcomes: FetchOutcome[] = [];
      for (const [index, ref] of group.entries()) {
        if (index > 0) await sleep(HOST_DELAY_MS);
        outcomes.push(await fetchDocument(ref));
      }
      return outcomes;
    }),
  );

  // Back into the caller's order, so a result lines up with the ref it came from.
  const byId = new Map(perHost.flat().map((outcome) => [outcome.documentId, outcome]));
  return refs.map((ref) => byId.get(ref.id)!);
}
