// ============================================================
// Repository confirmation — reconciliation rule 3
// ============================================================
// OpenAlex's is_oa and version on repository copies are wrong in both
// directions (golden set gs-22, gs-23), so a repository copy counts toward a
// tier only once its own repository has confirmed it. This reads the EPrints
// export, which most UK institutional repositories run (Southampton, LSE,
// Warwick's WRAP, City). A repository this cannot read stays unconfirmed: its
// copy is recorded but lifts nothing, and a person can confirm it from HQ.
//
// Two ways in, both checked against the live repositories on 2026-10-23:
//   1. The record id in the copy's own URL: /447739, /id/eprint/447739/, or a
//      file under it (/id/eprint/400597/1/x.docx, gs-21).
//   2. When OpenAlex's URL is unusable (gs-22's is "http://doi.org/…>)."),
//      the repository's search, by the paper's DOI, on a host known from the
//      copy's OpenAlex source. Only a record whose DOI matches exactly is
//      taken; nothing is ever matched on a title (rule 5).

import { fromEprints } from './licences.js';
import { normaliseDoi } from './openalex.js';
import type { Version } from './types.js';

const TIMEOUT_MS = 15_000;

// EPrints repositories by OpenAlex source id, for copies whose URL names no
// record. OpenAlex holds no homepage for these sources, so the host has to be
// known. LSE refuses its search page (403) but serves its record exports, so
// it is here for completeness and its copies resolve through way 1.
export const KNOWN_EPRINTS: Readonly<Record<string, string>> = {
  S4306401019: 'https://eprints.soton.ac.uk',          // ePrints Soton
  S4306400665: 'https://wrap.warwick.ac.uk',           // Warwick Research Archive Portal
  S4306401940: 'https://openaccess.city.ac.uk',        // City Research Online
  S4306401593: 'https://researchonline.lse.ac.uk',     // LSE Research Online
};

export interface RepositoryRecord {
  /** The best publicly available file. */
  version: Version | null;
  isOa: boolean;
  licence: string | null;
  /** The repository's own record URL, when it replaces an unusable one. */
  recordUrl: string | null;
  /** What was read, for the 'reconciled' event. */
  evidence: string;
}

export interface RepositoryCopy {
  landingUrl: string | null;
  pdfUrl: string | null;
  /** The copy's OpenAlex source id (S…). */
  sourceId: string | null;
}

interface EprintsDocument {
  content?: string;
  security?: string;
  license?: string;
  date_embargo?: string;
}

interface EprintsRecord {
  uri?: string;
  doi?: string;
  id_number?: string;
  documents?: EprintsDocument[];
}

const CONTENT_VERSION: Record<string, Version> = {
  published: 'publishedVersion',
  accepted: 'acceptedVersion',
  submitted: 'submittedVersion',
};
const RANK: Record<Version, number> = { publishedVersion: 3, acceptedVersion: 2, submittedVersion: 1 };

function parse(url: string | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The EPrints record id in a URL: /N, /id/eprint/N, or any file under either. */
export function eprintsRecordId(url: string | null): string | null {
  const u = parse(url);
  return u ? /^\/(?:id\/eprint\/)?(\d+)(?:\/|$)/.exec(u.pathname)?.[1] ?? null : null;
}

/** The EPrints JSON export URL for a copy, or null if its URLs name no record. */
export function eprintsExportUrl(copy: Pick<RepositoryCopy, 'landingUrl' | 'pdfUrl'>): string | null {
  for (const url of [copy.landingUrl, copy.pdfUrl]) {
    const id = eprintsRecordId(url);
    if (id) return `${parse(url)!.origin}/cgi/export/eprint/${id}/JSON/eprint-${id}.js`;
  }
  return null;
}

/** The repository search URL for a DOI, on the copy's known host. */
export function eprintsSearchUrl(copy: RepositoryCopy, doi: string): string | null {
  const origin = copy.sourceId ? KNOWN_EPRINTS[copy.sourceId] : undefined;
  if (!origin) return null;
  return `${origin}/cgi/search/simple?q=${encodeURIComponent(doi)}&output=JSON&_action_export=1`;
}

/** Pure: reads one EPrints record into the best public, unembargoed file. */
export function parseEprintsExport(payload: unknown, asOf: Date): RepositoryRecord | null {
  const docs = (payload as EprintsRecord | null)?.documents;
  if (!Array.isArray(docs)) return null;
  let best: { version: Version; licence: string | null; raw: EprintsDocument } | null = null;
  for (const d of docs) {
    const version = d.content ? CONTENT_VERSION[d.content] : undefined;
    if (!version || d.security !== 'public') continue;
    if (d.date_embargo && new Date(d.date_embargo).getTime() > asOf.getTime()) continue;
    if (!best || RANK[version] > RANK[best.version]) best = { version, licence: fromEprints(d.license), raw: d };
  }
  // The record's own URL, which also replaces any garbled URL OpenAlex gave the copy.
  const recordUrl = (payload as EprintsRecord).uri ?? null;
  if (!best) return { version: null, isOa: false, licence: null, recordUrl, evidence: 'no public, unembargoed file' };
  return {
    version: best.version,
    isOa: true,
    licence: best.licence,
    recordUrl,
    evidence: `content: ${best.raw.content}, security: public, license: ${best.raw.license ?? 'none'}`,
  };
}

/** Pure: the one search result whose DOI is exactly the paper's, as a record. */
export function pickByDoi(payload: unknown, doi: string, asOf: Date): RepositoryRecord | null {
  if (!Array.isArray(payload)) return null;
  const hits = (payload as EprintsRecord[]).filter((r) => normaliseDoi(r.doi ?? r.id_number) === doi);
  if (hits.length !== 1) return null; // none, or ambiguous: stays unconfirmed
  const record = parseEprintsExport(hits[0], asOf);
  return record && { ...record, recordUrl: hits[0].uri ?? null, evidence: `found by DOI search; ${record.evidence}` };
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json();
}

/** Confirms one repository copy at its repository. Null when the repository cannot be read. */
export async function confirmAtRepository(
  copy: RepositoryCopy,
  paperDoi: string | null,
  fetchImpl: typeof fetch = fetch,
  asOf: Date = new Date(),
): Promise<RepositoryRecord | null> {
  try {
    const exportUrl = eprintsExportUrl(copy);
    if (exportUrl) return parseEprintsExport(await getJson(exportUrl, fetchImpl), asOf);
    const doi = normaliseDoi(paperDoi);
    const searchUrl = doi ? eprintsSearchUrl(copy, doi) : null;
    if (searchUrl && doi) return pickByDoi(await getJson(searchUrl, fetchImpl), doi, asOf);
    return null;
  } catch {
    // Not EPrints after all, or not reachable: the copy stays unconfirmed.
    return null;
  }
}
