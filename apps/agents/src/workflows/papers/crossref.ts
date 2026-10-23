// ============================================================
// Crossref client — the publisher's own deposit for a DOI
// ============================================================
// GET https://api.crossref.org/works/{doi}
//
// Read for three things OpenAlex does not settle: the licence the publisher
// deposited for the version of record (rule 1), what kind of work the DOI is
// (posted-content is a preprint, whatever OpenAlex calls it), and notices
// against it — retractions, corrections, expressions of concern.
// Spec: docs/features/client-app/library-papers-spec.md#source-reconciliation-rules

import { normaliseDoi } from './openalex.js';
import type { Update } from './types.js';

const BASE = 'https://api.crossref.org/works/';
const TIMEOUT_MS = 20_000;
// Crossref's etiquette asks for a contact address; it routes the request to
// the polite pool.
const USER_AGENT = 'BTS-library-papers/1.0 (mailto:hq@btreasury.com.au)';

export interface CrossrefLicence {
  URL: string;
  'content-version'?: string;
  start?: { 'date-parts'?: number[][] };
  'delay-in-days'?: number;
}

export interface CrossrefWork {
  DOI: string;
  type?: string;
  subtype?: string;
  title?: string[];
  abstract?: string;
  license?: CrossrefLicence[];
  'update-to'?: Array<{ DOI?: string; type?: string }>;
  'updated-by'?: Array<{ DOI?: string; type?: string; source?: string }>;
  relation?: Record<string, Array<{ id?: string; 'id-type'?: string }>>;
  funder?: Array<{ name?: string; award?: string[] }>;
}

export class CrossrefError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'CrossrefError';
  }
}

/** The publisher's deposit for a DOI, or null if Crossref has none. */
export async function getCrossrefWork(doi: string, fetchImpl: typeof fetch = fetch): Promise<CrossrefWork | null> {
  const clean = normaliseDoi(doi);
  if (!clean) throw new CrossrefError(`Not a DOI: ${doi}`, null);
  const res = await fetchImpl(BASE + encodeURIComponent(clean), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new CrossrefError(`Crossref ${res.status} for ${clean}`, res.status);
  const body = (await res.json()) as { message?: CrossrefWork };
  return body.message ?? null;
}

function startDate(l: CrossrefLicence): Date | null {
  const parts = l.start?.['date-parts']?.[0];
  if (!parts?.length) return null;
  return new Date(Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1));
}

/**
 * Licence URLs the publisher deposited for one content version, in force on
 * `asOf`. 'vor' is the version of record; 'am' the accepted manuscript. A
 * text-and-data-mining licence (content-version 'tdm') is not an access
 * licence and is never returned.
 */
export function depositedLicences(work: CrossrefWork, contentVersion: 'vor' | 'am', asOf: Date): string[] {
  return (work.license ?? [])
    .filter((l) => (l['content-version'] ?? 'unspecified') === contentVersion)
    .filter((l) => {
      const start = startDate(l);
      if (!start) return true;
      const delay = (l['delay-in-days'] ?? 0) * 86_400_000;
      return start.getTime() + delay <= asOf.getTime();
    })
    .map((l) => l.URL);
}

/** A posted-content DOI is a preprint, whatever an index says about it. */
export function isPostedContent(work: CrossrefWork): boolean {
  return work.type === 'posted-content';
}

/** DOIs this record says it is the preprint of (relation is-preprint-of). */
export function publishedVersionDois(work: CrossrefWork): string[] {
  return (work.relation?.['is-preprint-of'] ?? [])
    .filter((r) => (r['id-type'] ?? 'doi') === 'doi')
    .map((r) => normaliseDoi(r.id))
    .filter((d): d is string => d !== null);
}

function kindOf(type: string | undefined): Update['kind'] | null {
  const t = (type ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  return t === 'retraction' || t === 'withdrawal' || t === 'removal' ? 'retracted'
    : t === 'correction' || t === 'erratum' || t === 'corrigendum' ? 'corrected'
    : t === 'expression_of_concern' ? 'concern_raised'
    : null;
}

/**
 * Notices against this work. Crossref lists them on the original as
 * `updated-by` (including Retraction Watch's records). Publishers that retract
 * in place (Elsevier, Springer: gs-23, gs-30) also put an `update-to` on the
 * original pointing at its own DOI, which is read the same way. One update per
 * kind and notice; a self-reference carries no notice DOI.
 */
export function updatesAgainst(work: CrossrefWork): Update[] {
  const own = normaliseDoi(work.DOI);
  const out: Update[] = [];
  const add = (type: string | undefined, doi: string | undefined) => {
    const kind = kindOf(type);
    if (!kind) return;
    const notice = normaliseDoi(doi);
    const noticeDoi = notice === own ? null : notice;
    if (out.some((u) => u.kind === kind && u.noticeDoi === noticeDoi)) return;
    // A self-reference adds nothing once a real notice of the same kind is known.
    if (noticeDoi === null && out.some((u) => u.kind === kind)) return;
    if (noticeDoi !== null) {
      const self = out.findIndex((u) => u.kind === kind && u.noticeDoi === null);
      if (self >= 0) out.splice(self, 1);
    }
    out.push({ kind, noticeDoi, source: 'crossref' });
  };
  for (const u of work['updated-by'] ?? []) add(u.type, u.DOI);
  for (const u of work['update-to'] ?? []) if (normaliseDoi(u.DOI) === own) add(u.type, u.DOI);
  return out;
}

/**
 * True when the DOI is itself a retraction, correction or concern notice: its
 * `update-to` names another DOI. An `update-to` naming its own DOI is a
 * retracted original, not a notice (gs-23, gs-30).
 */
export function isNotice(work: CrossrefWork): boolean {
  const own = normaliseDoi(work.DOI);
  return (work['update-to'] ?? []).some((u) => normaliseDoi(u.DOI) !== own);
}

/** Strips JATS markup from a deposited abstract. */
export function plainAbstract(work: CrossrefWork): string | null {
  if (!work.abstract) return null;
  const text = work.abstract
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
