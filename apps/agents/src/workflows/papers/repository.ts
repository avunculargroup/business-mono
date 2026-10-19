// ============================================================
// Repository confirmation — reconciliation rule 3
// ============================================================
// OpenAlex's is_oa and version on repository copies are wrong in both
// directions (golden set gs-22, gs-23), so a repository copy counts toward a
// tier only once its own repository has confirmed it. This reads the EPrints
// export, which most UK institutional repositories run (Southampton, LSE,
// Warwick's WRAP, City). A repository this cannot read stays unconfirmed: its
// copy is recorded but lifts nothing, and a person can confirm it from HQ.

import { fromEprints } from './licences.js';
import type { Version } from './types.js';

const TIMEOUT_MS = 15_000;

export interface RepositoryRecord {
  /** The best publicly available file. */
  version: Version | null;
  isOa: boolean;
  licence: string | null;
  /** What was read, for the 'reconciled' event. */
  evidence: string;
}

interface EprintsDocument {
  content?: string;
  security?: string;
  license?: string;
  date_embargo?: string;
}

const CONTENT_VERSION: Record<string, Version> = {
  published: 'publishedVersion',
  accepted: 'acceptedVersion',
  submitted: 'submittedVersion',
};
const RANK: Record<Version, number> = { publishedVersion: 3, acceptedVersion: 2, submittedVersion: 1 };

/** The EPrints JSON export URL for a landing page, or null if the URL is not an EPrints record. */
export function eprintsExportUrl(landingUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(landingUrl);
  } catch {
    return null;
  }
  const m = /^\/(?:id\/eprint\/)?(\d+)\/?$/.exec(url.pathname);
  if (!m) return null;
  return `${url.origin}/cgi/export/eprint/${m[1]}/JSON/eprint-${m[1]}.js`;
}

/** Pure: reads an EPrints export into the best public, unembargoed file. */
export function parseEprintsExport(payload: unknown, asOf: Date): RepositoryRecord | null {
  const docs = (payload as { documents?: EprintsDocument[] } | null)?.documents;
  if (!Array.isArray(docs)) return null;
  let best: { version: Version; licence: string | null; raw: EprintsDocument } | null = null;
  for (const d of docs) {
    const version = d.content ? CONTENT_VERSION[d.content] : undefined;
    if (!version || d.security !== 'public') continue;
    if (d.date_embargo && new Date(d.date_embargo).getTime() > asOf.getTime()) continue;
    if (!best || RANK[version] > RANK[best.version]) best = { version, licence: fromEprints(d.license), raw: d };
  }
  if (!best) return { version: null, isOa: false, licence: null, evidence: 'no public, unembargoed file' };
  return {
    version: best.version,
    isOa: true,
    licence: best.licence,
    evidence: `content: ${best.raw.content}, security: public, license: ${best.raw.license ?? 'none'}`,
  };
}

/** Confirms one repository copy at its repository. Null when the repository cannot be read. */
export async function confirmAtRepository(
  landingUrl: string,
  fetchImpl: typeof fetch = fetch,
  asOf: Date = new Date(),
): Promise<RepositoryRecord | null> {
  const exportUrl = eprintsExportUrl(landingUrl);
  if (!exportUrl) return null;
  try {
    const res = await fetchImpl(exportUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseEprintsExport(await res.json(), asOf);
  } catch {
    // Not EPrints after all, or not reachable: the copy stays unconfirmed.
    return null;
  }
}
