// ============================================================
// OpenAlex client — the index the papers register is built on
// ============================================================
// GET https://api.openalex.org/works/{W…|doi:10…}?api_key=…   (singleton, free)
// GET https://api.openalex.org/works?filter=…&cursor=…&per-page=200&api_key=…
//
// A key is mandatory on every request (OPENALEX_API_KEY). OpenAlex is the
// index, not the authority on licences or versions: what it says here is
// corrected by reconcile.ts before anything is written.
// Spec: docs/features/client-app/library-papers-spec.md#2-the-metadata-sources

import { createLogger } from '../../lib/logger.js';

const log = createLogger('openalex');

const BASE = 'https://api.openalex.org';
const TIMEOUT_MS = 20_000;

// Only what the pipeline reads. Keeps each response small, and makes the
// fields this module depends on explicit.
export const WORK_FIELDS = [
  'id', 'doi', 'title', 'display_name', 'publication_year', 'publication_date', 'language',
  'type', 'type_crossref', 'primary_location', 'locations', 'open_access', 'authorships',
  'cited_by_count', 'is_retracted', 'abstract_inverted_index', 'grants', 'funders', 'awards',
].join(',');

export interface OpenAlexSource {
  id?: string | null;
  display_name?: string | null;
  issn_l?: string | null;
  issn?: string[] | null;
  is_in_doaj?: boolean | null;
  host_organization_name?: string | null;
  type?: string | null;
}

export interface OpenAlexLocation {
  is_oa?: boolean | null;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: OpenAlexSource | null;
  license?: string | null;
  version?: string | null;
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  language?: string | null;
  type?: string | null;
  type_crossref?: string | null;
  primary_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  open_access?: { is_oa?: boolean; oa_status?: string | null; oa_url?: string | null } | null;
  authorships?: Array<{
    author_position?: string;
    author?: { id?: string | null; display_name?: string | null; orcid?: string | null } | null;
    raw_affiliation_strings?: string[] | null;
    is_corresponding?: boolean | null;
  }> | null;
  cited_by_count?: number | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  // Funding moved from `grants` to `funders`/`awards` in 2025; read whichever is present.
  grants?: Array<{ funder_display_name?: string | null; award_id?: string | null }> | null;
  awards?: Array<{ funder_display_name?: string | null; funder_award_id?: string | null }> | null;
  funders?: Array<{ display_name?: string | null }> | null;
}

export interface OpenAlexPage {
  results: OpenAlexWork[];
  nextCursor: string | null;
  count: number | null;
}

export class OpenAlexError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'OpenAlexError';
  }
}

function apiKey(): string {
  const key = process.env['OPENALEX_API_KEY'];
  if (!key) throw new OpenAlexError('OPENALEX_API_KEY is not set', null);
  return key;
}

async function getJson(path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries({ ...params, api_key: apiKey() })) url.searchParams.set(k, v);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new OpenAlexError(`OpenAlex ${res.status} for ${path}`, res.status);
  return res.json();
}

/** "https://openalex.org/W123" → "W123"; also accepts "W123". */
export function shortOpenAlexId(id: string | null | undefined): string | null {
  if (!id) return null;
  const m = /([WASIPFT]\d+)$/.exec(id);
  return m ? m[1] : null;
}

/** "https://doi.org/10.X/Y" → "10.x/y"; null when not a DOI. Lowercased, as papers.doi requires. */
export function normaliseDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const m = /(10\.\d{4,9}\/\S+)$/i.exec(doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''));
  return m ? m[1].toLowerCase() : null;
}

/**
 * Rebuilds plaintext from OpenAlex's inverted index. OpenAlex ships abstracts
 * this way deliberately (they may be the publisher's copyright); the text is
 * stored for Charlie and for agent retrieval and reaches a subscriber only for
 * a read_here paper — enforced by RLS on paper_abstracts.
 */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  const text = words.filter((w) => w !== undefined).join(' ').trim();
  return text || null;
}

/** One work by OpenAlex id or DOI. Null when OpenAlex does not have it. Free. */
export async function getWork(idOrDoi: string, fetchImpl: typeof fetch = fetch): Promise<OpenAlexWork | null> {
  const doi = normaliseDoi(idOrDoi);
  const key = doi ? `doi:${doi}` : shortOpenAlexId(idOrDoi);
  if (!key) throw new OpenAlexError(`Not an OpenAlex id or DOI: ${idOrDoi}`, null);
  const body = await getJson(`/works/${key}`, { select: WORK_FIELDS }, fetchImpl);
  return (body as OpenAlexWork | null) ?? null;
}

/** One page of a filtered list. Pass cursor '*' to start. */
export async function listWorks(
  filter: string,
  cursor: string,
  fetchImpl: typeof fetch = fetch,
  perPage = 200,
): Promise<OpenAlexPage> {
  const body = (await getJson(
    '/works',
    { filter, cursor, 'per-page': String(perPage), select: WORK_FIELDS },
    fetchImpl,
  )) as { results?: OpenAlexWork[]; meta?: { next_cursor?: string | null; count?: number } } | null;
  const results = body?.results ?? [];
  log.debug({ filter, returned: results.length }, 'openalex page');
  return { results, nextCursor: body?.meta?.next_cursor ?? null, count: body?.meta?.count ?? null };
}
