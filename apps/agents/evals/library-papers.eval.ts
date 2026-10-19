/**
 * Library papers — Session 2 acceptance against the golden set.
 *
 * Runs every golden-set entry that carries a DOI or OpenAlex id through the
 * real resolve pipeline: OpenAlex, Crossref, the repositories, the source
 * reconciliation rules and Rex. Commits are captured in memory, never written.
 * Then scores against the hand labels in library-papers/golden-set.json:
 *
 *   - access tier: every resolvable entry right (the spec's 40 of 40; access is
 *     deterministic, so anything less is a bug), computed from the reconciled
 *     copies with the same rules the database applies (src/workflows/papers/accessTier.ts);
 *   - relevance tier: at least 90% (the spec's 36 of 40);
 *   - every entry with a knownSourceError right, and gs-37 resolved as its own
 *     record linked to gs-15.
 *
 * gs-38, gs-39 and gs-40 are not in OpenAlex. They have no identifier the
 * pipeline can look up (rule 5: never a title match), so they are entered by a
 * person, and their tiers are checked through the schema by
 * packages/db/acceptance/golden-set-tiers.mjs instead.
 *
 * Hits real APIs and needs OPENALEX_API_KEY and ANTHROPIC_API_KEY (or
 * OPENROUTER_API_KEY), plus network access to api.openalex.org,
 * api.crossref.org and the repositories. Not run in CI. Locally:
 *   pnpm --filter @platform/agents test:eval -- library-papers
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAccessTier } from '../src/workflows/papers/accessTier.js';
import { defaultDeps, resolvePaper } from '../src/workflows/papers/resolve.js';
import type { Location, PeerReviewStatus } from '../src/workflows/papers/types.js';

interface Entry {
  id: string;
  identifiers: { doi?: string; openalexId?: string; handle?: string; url?: string };
  expected: { peerReviewStatus: PeerReviewStatus; relevanceTier: string; accessTier: string; bestLicence: string | null };
  expectedRelations?: Array<{ relation: string; from: string; to: string }>;
  knownSourceError?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const entries: Entry[] = JSON.parse(readFileSync(resolve(here, 'library-papers/golden-set.json'), 'utf-8'));

type Payload = {
  identifiers: { doi: string | null };
  peer_review_status: PeerReviewStatus;
  relevance_tier: string;
  published_version_doi: string | null;
  locations: Array<{ host_type: Location['hostType']; version: Location['version']; licence: string | null; is_oa: boolean; verified_at_host: boolean }>;
};

describe('library papers golden set', () => {
  it('resolves the golden set within the spec\'s Session 2 acceptance', async () => {
    const rows: Array<Record<string, string | boolean>> = [];
    let accessRight = 0;
    let relevanceRight = 0;
    let scored = 0;
    const accessWrong: string[] = [];
    const sourceErrorWrong: string[] = [];

    for (const e of entries) {
      const doi = e.identifiers.doi ?? null;
      const openalexId = e.identifiers.openalexId ?? null;
      if (!doi && !openalexId) {
        rows.push({ id: e.id, result: 'manual entry (not in OpenAlex)' });
        continue;
      }
      const committed: Payload[] = [];
      const result = await resolvePaper({ doi, openalexId }, {
        ...defaultDeps,
        commit: async (payload) => {
          committed.push(payload as unknown as Payload);
          return `captured-${committed.length}`;
        },
      });
      scored += 1;
      // A draft commits its published version first; score the entry's own record.
      const own = committed.find((p) => p.identifiers.doi === doi?.toLowerCase()) ?? committed[committed.length - 1];
      if (result.status !== 'committed' || !own) {
        accessWrong.push(e.id);
        if (e.knownSourceError) sourceErrorWrong.push(e.id);
        rows.push({ id: e.id, result: result.status });
        continue;
      }
      const tier = computeAccessTier(
        own.locations.map((l) => ({ hostType: l.host_type, version: l.version, licence: l.licence, isOa: l.is_oa, verifiedAtHost: l.verified_at_host })),
        own.peer_review_status,
      );
      const accessOk = tier.tier === e.expected.accessTier;
      const relevanceOk = own.relevance_tier === e.expected.relevanceTier;
      if (accessOk) accessRight += 1;
      else accessWrong.push(e.id);
      if (relevanceOk) relevanceRight += 1;
      if (e.knownSourceError && !accessOk) sourceErrorWrong.push(e.id);
      rows.push({
        id: e.id,
        access: `${tier.tier}${accessOk ? '' : ` (want ${e.expected.accessTier})`}`,
        relevance: `${own.relevance_tier}${relevanceOk ? '' : ` (want ${e.expected.relevanceTier})`}`,
        peerReview: `${own.peer_review_status}${own.peer_review_status === e.expected.peerReviewStatus ? '' : ` (want ${e.expected.peerReviewStatus})`}`,
      });
    }

    console.table(rows);
    console.log(`\naccess ${accessRight}/${scored}, relevance ${relevanceRight}/${scored}, manual ${entries.length - scored}`);

    // gs-37: its own record, pointing at gs-15.
    const gs37 = entries.find((e) => e.id === 'gs-37')!;
    const draftCommits: Payload[] = [];
    await resolvePaper({ doi: gs37.identifiers.doi }, { ...defaultDeps, commit: async (p) => { draftCommits.push(p as unknown as Payload); return 'x'; } });
    const draft = draftCommits.find((p) => p.identifiers.doi === gs37.identifiers.doi!.toLowerCase());
    const gs15 = entries.find((e) => e.id === 'gs-15')!;

    expect(accessWrong, 'access tier is deterministic: every resolvable entry must be right').toEqual([]);
    expect(sourceErrorWrong, 'every knownSourceError entry must come out right despite OpenAlex').toEqual([]);
    expect(relevanceRight / scored).toBeGreaterThanOrEqual(0.9);
    expect(draft?.published_version_doi).toBe(gs15.identifiers.doi!.toLowerCase());
  }, 15 * 60_000);
});
