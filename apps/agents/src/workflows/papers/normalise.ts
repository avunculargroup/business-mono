// ============================================================
// OpenAlex work → the register's shape, before reconciliation
// ============================================================
// Faithful to what OpenAlex says, including where it is wrong: correcting it
// is reconcile.ts's job, and keeping the two apart is what lets each rule's
// input and verdict be logged.

import { fromOpenAlex } from './licences.js';
import {
  abstractFromInvertedIndex, normaliseDoi, shortOpenAlexId, type OpenAlexLocation, type OpenAlexWork,
} from './openalex.js';
import type { Author, Funder, HostType, Identifiers, Location, Venue, VenueType, Version } from './types.js';

export interface NormalisedWork {
  identifiers: Identifiers;
  title: string;
  publicationDate: string | null;
  publicationYear: number | null;
  language: string | null;
  /** OpenAlex's own type ('article', 'preprint', 'editorial'…), as reported. */
  workType: string | null;
  venue: Venue | null;
  locations: Location[];
  authors: Author[];
  funders: Funder[];
  abstract: string | null;
  isRetracted: boolean;
  citedByCount: number | null;
}

// Hosts that publish preprints and working papers rather than versions of
// record. OpenAlex types them all as 'repository'. SSRN is here as well as in
// rule 2: it is never a published or accepted copy.
const PREPRINT_HOSTS = [
  'arxiv.org', 'preprints.org', 'ssrn.com', 'researchsquare.com', 'biorxiv.org', 'medrxiv.org',
  'osf.io', 'techrxiv.org', 'authorea.com', 'econstor.eu', 'nber.org', 'repec.org',
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isPreprintHost(url: string | null | undefined): boolean {
  const host = hostOf(url);
  return host !== null && PREPRINT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function venueType(sourceType: string | null | undefined): VenueType {
  switch (sourceType) {
    case 'journal': return 'journal';
    case 'conference': return 'conference';
    case 'book series': return 'book_series';
    case 'repository': return 'repository';
    default: return 'other';
  }
}

function hostType(loc: OpenAlexLocation): HostType {
  if (isPreprintHost(loc.landing_page_url) || isPreprintHost(loc.pdf_url)) return 'preprint_server';
  const t = loc.source?.type;
  if (t === 'repository') return 'repository';
  if (t === 'journal' || t === 'conference' || t === 'book series' || t === 'ebook platform') return 'publisher';
  return 'other';
}

function version(v: string | null | undefined): Version | null {
  return v === 'publishedVersion' || v === 'acceptedVersion' || v === 'submittedVersion' ? v : null;
}

/** arXiv id from an arXiv DOI or abs URL, without its version suffix. */
export function arxivIdFrom(doi: string | null, urls: Array<string | null | undefined>): string | null {
  const fromDoi = doi ? /^10\.48550\/arxiv\.(.+)$/i.exec(doi)?.[1] : undefined;
  const fromUrl = urls.map((u) => (u ? /arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/i.exec(u)?.[1] : undefined)).find(Boolean);
  const id = fromDoi ?? fromUrl;
  return id ? id.replace(/v\d+$/i, '').toLowerCase() : null;
}

function locationOf(loc: OpenAlexLocation): Location | null {
  const landingUrl = loc.landing_page_url ?? null;
  const pdfUrl = loc.pdf_url ?? null;
  if (!landingUrl && !pdfUrl) return null;
  const landingDoi = landingUrl ? normaliseDoi(landingUrl) : null;
  return {
    hostType: hostType(loc),
    sourceName: loc.source?.display_name ?? null,
    landingUrl,
    pdfUrl,
    doi: landingDoi,
    version: version(loc.version),
    licence: fromOpenAlex(loc.license),
    oaStatus: null,
    isOa: loc.is_oa === true,
    reportedBy: 'openalex',
    verifiedAtHost: false,
  };
}

/** Copies keyed as paper_locations is unique on them: one row per URL. */
function dedupeLocations(locations: Location[]): Location[] {
  const seen = new Map<string, Location>();
  for (const l of locations) {
    const key = l.landingUrl ?? l.pdfUrl ?? '';
    const prior = seen.get(key);
    // Keep the more informative report: open over closed, then the one with a PDF.
    if (!prior || (l.isOa && !prior.isOa) || (l.isOa === prior.isOa && l.pdfUrl && !prior.pdfUrl)) seen.set(key, l);
  }
  return [...seen.values()];
}

export function normaliseWork(work: OpenAlexWork): NormalisedWork {
  const doi = normaliseDoi(work.doi);
  const raw = work.locations?.length ? work.locations : work.primary_location ? [work.primary_location] : [];
  const locations = dedupeLocations(raw.map(locationOf).filter((l): l is Location => l !== null));
  const source = work.primary_location?.source ?? null;

  const funders: Funder[] = [];
  for (const g of work.grants ?? []) {
    if (g.funder_display_name) funders.push({ name: g.funder_display_name, awardId: g.award_id ?? null, source: 'openalex' });
  }
  for (const a of work.awards ?? []) {
    if (a.funder_display_name) funders.push({ name: a.funder_display_name, awardId: a.funder_award_id ?? null, source: 'openalex' });
  }
  if (!funders.length) {
    for (const f of work.funders ?? []) if (f.display_name) funders.push({ name: f.display_name, awardId: null, source: 'openalex' });
  }

  return {
    identifiers: {
      doi,
      openalexId: shortOpenAlexId(work.id),
      arxivId: arxivIdFrom(doi, raw.flatMap((l) => [l.landing_page_url, l.pdf_url])),
      handle: null,
      sourceUrl: null,
    },
    title: (work.title ?? work.display_name ?? '').trim() || '(untitled)',
    publicationDate: work.publication_date ?? null,
    publicationYear: work.publication_year ?? null,
    language: work.language ?? null,
    workType: work.type ?? null,
    venue: source?.display_name
      ? {
          openalexSourceId: shortOpenAlexId(source.id),
          name: source.display_name,
          venueType: venueType(source.type),
          issnL: source.issn_l ?? null,
          issns: source.issn ?? [],
          publisher: source.host_organization_name ?? null,
          isInDoaj: source.is_in_doaj ?? null,
        }
      : null,
    locations,
    authors: (work.authorships ?? []).flatMap((a, i) =>
      a.author?.display_name
        ? [{
            openalexAuthorId: shortOpenAlexId(a.author.id),
            orcid: a.author.orcid ? (/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/.exec(a.author.orcid)?.[1] ?? null) : null,
            displayName: a.author.display_name,
            position: i + 1,
            rawAffiliation: a.raw_affiliation_strings?.join('; ') || null,
            isCorresponding: a.is_corresponding === true,
          }]
        : []),
    funders,
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    isRetracted: work.is_retracted === true,
    citedByCount: work.cited_by_count ?? null,
  };
}
