// ============================================================
// paperResolve — one work from identifier to committed candidate
// ============================================================
// Deterministic end to end except one step: fetch (OpenAlex, Crossref, the
// repository), reconcile, classify peer review, band relevance, ask Rex to
// confirm the band, commit. The access tier is not computed here at all: the
// database derives it from the copies this writes.
// Spec: docs/features/client-app/library-papers-spec.md#ingestion-and-watch-pipeline

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { classifyPeerReview, scoreRelevance, tierForBand } from './classify.js';
import { buildCommitPayload, commitResolve } from './commit.js';
import { confirmRelevance, decideRelevance } from './confirmRelevance.js';
import { getCrossrefWork, isNotice, plainAbstract, type CrossrefWork } from './crossref.js';
import { normaliseWork } from './normalise.js';
import { getWork, normaliseDoi, type OpenAlexWork } from './openalex.js';
import { reconcile } from './reconcile.js';
import { confirmAtRepository, type RepositoryRecord } from './repository.js';
import type { PeerReviewStatus, RelevanceTier } from './types.js';

const log = createLogger('paper-resolve');

export interface ResolveDeps {
  getWork: typeof getWork;
  getCrossrefWork: typeof getCrossrefWork;
  confirmAtRepository: typeof confirmAtRepository;
  confirmRelevance: typeof confirmRelevance;
  commit: typeof commitResolve;
  now: () => Date;
}

export const defaultDeps: ResolveDeps = {
  getWork, getCrossrefWork, confirmAtRepository, confirmRelevance, commit: commitResolve, now: () => new Date(),
};

export interface ResolveTarget {
  doi?: string | null;
  openalexId?: string | null;
  /** A work the caller already holds (the watch's list page), saving the lookup. */
  work?: OpenAlexWork | null;
  discoveredVia?: string | null;
}

export type ResolveResult =
  | { status: 'committed'; paperId: string; relevanceTier: RelevanceTier; peerReviewStatus: PeerReviewStatus; isDraft: boolean }
  | { status: 'not_found' | 'notice' | 'no_identifier'; reason: string };

async function crossrefOrNull(doi: string | null, deps: ResolveDeps): Promise<CrossrefWork | null> {
  if (!doi) return null;
  try {
    return await deps.getCrossrefWork(doi);
  } catch (err) {
    // Crossref down is not a dead resolve: rule 1 and the notices wait for the next run.
    log.warn({ err, doi }, 'crossref lookup failed');
    return null;
  }
}

export async function resolvePaper(
  target: ResolveTarget,
  deps: ResolveDeps = defaultDeps,
  depth = 0,
): Promise<ResolveResult> {
  const requestedDoi = normaliseDoi(target.doi ?? null);
  const lookup = requestedDoi ?? target.openalexId ?? null;
  if (!lookup && !target.work) {
    // Rule 5: nothing is ever matched on a title. No identifier, no resolve.
    return { status: 'no_identifier', reason: 'a work needs a DOI or an OpenAlex id to resolve' };
  }
  const work = target.work ?? (await deps.getWork(lookup!));
  if (!work) return { status: 'not_found', reason: `OpenAlex has no work for ${requestedDoi ?? target.openalexId}` };

  const normalised = normaliseWork(work);
  const ownDoi = requestedDoi ?? normalised.identifiers.doi;
  const crossref = await crossrefOrNull(ownDoi, deps);
  // A retraction or correction notice is evidence about another paper, not a paper.
  if (crossref && isNotice(crossref)) return { status: 'notice', reason: `${ownDoi} is a notice` };

  const repository = new Map<string, RepositoryRecord | null>();
  for (const l of normalised.locations) {
    if (l.hostType === 'repository' && l.landingUrl && !repository.has(l.landingUrl)) {
      repository.set(l.landingUrl, await deps.confirmAtRepository(l.landingUrl));
    }
  }

  const reconciled = reconcile({ work: normalised, requestedDoi, crossref, repository, asOf: deps.now() });
  const merged = reconciled.mergedInto !== null;

  // Rule 4: the published version is committed first, so the draft's edge
  // has a row to point at. One level only: a published version is never itself a draft.
  if (reconciled.isDraft && reconciled.publishedVersionDoi && depth === 0) {
    const published = await resolvePaper(
      merged ? { doi: reconciled.publishedVersionDoi, work, discoveredVia: target.discoveredVia } : { doi: reconciled.publishedVersionDoi, discoveredVia: target.discoveredVia },
      deps,
      depth + 1,
    );
    if (published.status !== 'committed') {
      log.warn({ draft: ownDoi, published: reconciled.publishedVersionDoi, status: published.status }, 'published version did not resolve');
    }
  }

  // A merged draft is described by its own Crossref deposit, never by the published work's metadata.
  const title = merged ? (crossref?.title?.[0] ?? `${normalised.title} (preprint)`) : normalised.title;
  const abstractText = merged ? plainAbstract(crossref ?? { DOI: '' }) : normalised.abstract ?? (crossref ? plainAbstract(crossref) : null);
  const abstract = abstractText
    ? { text: abstractText, source: (merged || !normalised.abstract ? 'crossref' : 'openalex_index') as 'crossref' | 'openalex_index' }
    : null;

  const peerReview = classifyPeerReview({
    workType: merged ? 'preprint' : normalised.workType,
    crossrefType: crossref?.type ?? null,
    venueType: merged ? null : normalised.venue?.venueType ?? null,
    isDraft: reconciled.isDraft,
  });

  const scores = scoreRelevance(title, abstract?.text ?? null);
  const skipped = scores.band === 'clear_exclude';
  const verdict = skipped
    ? null
    : await deps.confirmRelevance({ title, abstract: abstract?.text ?? null, venue: merged ? null : normalised.venue?.name ?? null, workType: merged ? 'preprint' : normalised.workType, scores });
  const relevance = decideRelevance(scores, tierForBand(scores.band), verdict, skipped);

  const payload = buildCommitPayload({
    work: normalised,
    reconciled,
    title,
    abstract,
    peerReview,
    relevance,
    includeVenueAndAuthors: !merged,
    discoveredVia: target.discoveredVia ?? null,
  });
  const paperId = await deps.commit(payload);
  log.info({ paperId, tier: relevance.tier, peerReview: peerReview.status, draft: reconciled.isDraft }, 'paper resolved');
  return { status: 'committed', paperId, relevanceTier: relevance.tier, peerReviewStatus: peerReview.status, isDraft: reconciled.isDraft };
}

// ── The workflow, for one-off resolves (HQ, Simon) ─────────────────────────

const resolveInput = z.object({
  doi: z.string().nullish(),
  openalexId: z.string().nullish(),
  discoveredVia: z.string().uuid().nullish(),
});

const resolveStep = createStep({
  id: 'resolve',
  inputSchema: resolveInput,
  outputSchema: z.object({ status: z.string(), paperId: z.string().nullable(), detail: z.string().nullable() }),
  execute: async ({ inputData }) => {
    const result = await resolvePaper(inputData);
    return result.status === 'committed'
      ? { status: result.status, paperId: result.paperId, detail: `${result.relevanceTier}, ${result.peerReviewStatus}` }
      : { status: result.status, paperId: null, detail: result.reason };
  },
});

export const paperResolveWorkflow = createWorkflow({
  id: 'paperResolve',
  inputSchema: resolveInput,
  outputSchema: z.object({ status: z.string(), paperId: z.string().nullable(), detail: z.string().nullable() }),
})
  .then(resolveStep)
  .commit();
