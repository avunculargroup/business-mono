// ============================================================
// The commit payload — one resolve result, for commit_paper_resolve()
// ============================================================
// Snake-case keys matching supabase/migrations/20261019100000_paper_resolve.sql,
// which documents the shape and does the deduplication, the copy upserts and
// the event logging in one transaction.

import { supabase } from '@platform/db';
import type { RelevanceDecision } from './confirmRelevance.js';
import type { NormalisedWork } from './normalise.js';
import type { PeerReviewResult } from './classify.js';
import type { Reconciled } from './reconcile.js';

export interface CommitInput {
  work: NormalisedWork;
  reconciled: Reconciled;
  title: string;
  abstract: { text: string; source: 'crossref' | 'openalex_index' } | null;
  peerReview: PeerReviewResult;
  relevance: RelevanceDecision;
  /** A merged draft takes none of the published work's venue or authors. */
  includeVenueAndAuthors: boolean;
  discoveredVia: string | null;
}

export function buildCommitPayload(input: CommitInput): Record<string, unknown> {
  const { work, reconciled } = input;
  const ids = reconciled.identifiers;
  return {
    identifiers: {
      doi: ids.doi, openalex_id: ids.openalexId, arxiv_id: ids.arxivId, handle: ids.handle, source_url: ids.sourceUrl,
    },
    title: input.title,
    publication_date: work.publicationDate,
    publication_year: work.publicationYear,
    language: work.language,
    work_type: reconciled.isDraft ? 'preprint' : work.workType,
    venue: input.includeVenueAndAuthors && work.venue
      ? {
          openalex_source_id: work.venue.openalexSourceId,
          name: work.venue.name,
          venue_type: work.venue.venueType,
          issn_l: work.venue.issnL,
          issns: work.venue.issns,
          publisher: work.venue.publisher,
          is_in_doaj: work.venue.isInDoaj,
        }
      : null,
    peer_review_status: input.peerReview.status,
    peer_review_basis: input.peerReview.basis,
    relevance_tier: input.relevance.tier,
    relevance_basis: input.relevance.basis,
    topics: input.relevance.topics,
    funders: work.funders.map((f) => ({ name: f.name, award_id: f.awardId, source: f.source })),
    cited_by_count: reconciled.isDraft ? null : work.citedByCount,
    abstract: input.abstract,
    locations: reconciled.locations.map((l) => ({
      host_type: l.hostType,
      source_name: l.sourceName,
      landing_url: l.landingUrl,
      pdf_url: l.pdfUrl,
      doi: l.doi,
      version: l.version,
      licence: l.licence,
      oa_status: l.oaStatus,
      is_oa: l.isOa,
      reported_by: l.reportedBy,
      verified_at_host: l.verifiedAtHost,
    })),
    authors: input.includeVenueAndAuthors
      ? work.authors.map((a) => ({
          openalex_author_id: a.openalexAuthorId,
          orcid: a.orcid,
          display_name: a.displayName,
          position: a.position,
          raw_affiliation: a.rawAffiliation,
          is_corresponding: a.isCorresponding,
        }))
      : [],
    updates: reconciled.updates.map((u) => ({ kind: u.kind, notice_doi: u.noticeDoi, source: u.source })),
    reconciled: reconciled.events,
    published_version_doi: reconciled.publishedVersionDoi,
    discovered_via: input.discoveredVia,
  };
}

// commit_paper_resolve reaches the generated types when its migration applies
// (the regenerate-types Action commits them on merge); until then, untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Writes one result; returns the paper's id. */
export async function commitResolve(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.rpc('commit_paper_resolve', { payload });
  if (error) throw error;
  return data as unknown as string;
}
