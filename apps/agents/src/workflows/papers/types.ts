// ============================================================
// Library papers pipeline — shapes shared by the resolve steps
// ============================================================
// The vocabulary matches the CHECK constraints in
// supabase/migrations/20261018100000_library_papers.sql; a value outside them
// fails the commit rather than landing.
// Spec: docs/features/client-app/library-papers-spec.md#ingestion-and-watch-pipeline

export type Version = 'publishedVersion' | 'acceptedVersion' | 'submittedVersion';
export type HostType = 'publisher' | 'repository' | 'preprint_server' | 'other';
export type OaStatus = 'diamond' | 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';
export type ReportedBy = 'openalex' | 'crossref' | 'repository' | 'arxiv' | 'manual';
export type PeerReviewStatus = 'peer_reviewed' | 'preprint' | 'not_peer_reviewed' | 'unknown';
export type RelevanceTier = 'core' | 'substantial' | 'peripheral' | 'excluded';
export type VenueType = 'journal' | 'conference' | 'book_series' | 'repository' | 'other';

/** One copy of a work, as the pipeline will write it to paper_locations. */
export interface Location {
  hostType: HostType;
  sourceName: string | null;
  landingUrl: string | null;
  pdfUrl: string | null;
  /** A copy with its own DOI: a preprint or working paper (rule 4). */
  doi: string | null;
  version: Version | null;
  /** A code in paper_licences, or null when no licence is stated. */
  licence: string | null;
  oaStatus: OaStatus | null;
  isOa: boolean;
  reportedBy: ReportedBy;
  verifiedAtHost: boolean;
}

export interface Venue {
  openalexSourceId: string | null;
  name: string;
  venueType: VenueType;
  issnL: string | null;
  issns: string[];
  publisher: string | null;
  isInDoaj: boolean | null;
}

export interface Author {
  openalexAuthorId: string | null;
  orcid: string | null;
  displayName: string;
  position: number;
  rawAffiliation: string | null;
  isCorresponding: boolean;
}

export interface Funder {
  name: string;
  awardId: string | null;
  source: 'openalex' | 'crossref';
}

/** What changed a work's record, and why: a paper_events 'reconciled' row. */
export interface ReconciledEvent {
  rule: number;
  input: string;
  verdict: string;
}

/** A dated notice against the work: a retraction, correction or concern. */
export interface Update {
  kind: 'retracted' | 'corrected' | 'concern_raised';
  noticeDoi: string | null;
  source: 'crossref' | 'openalex';
}

/** The identifiers a work is deduplicated on, in order. */
export interface Identifiers {
  doi: string | null;
  openalexId: string | null;
  arxivId: string | null;
  handle: string | null;
  sourceUrl: string | null;
}
