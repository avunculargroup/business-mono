// ============================================================
// Access tier, in TypeScript — for the golden-set eval and tests only
// ============================================================
// The database is the authority: refresh_paper_access() in
// supabase/migrations/20261018100000_library_papers.sql derives
// papers.access_tier, and nothing here writes it. This mirror exists so the
// eval can score the pipeline's reconciled copies without a database. Both are
// checked against the same hand labels — this one in accessTier.test.ts, the
// SQL in packages/db/acceptance/golden-set-tiers.mjs — so if they drift apart,
// one of the two goes red.

import type { Location, PeerReviewStatus } from './types.js';

export type AccessTier = 'read_here' | 'read_at_source' | 'metadata_only';

/** The licences approved for rehosting as seeded on 2026-10-18. */
export const APPROVED_LICENCES: ReadonlySet<string> = new Set(['cc-by', 'cc-by-sa', 'cc0', 'public-domain']);

export function computeAccessTier(
  locations: readonly Pick<Location, 'hostType' | 'version' | 'licence' | 'isOa' | 'verifiedAtHost'>[],
  peerReviewStatus: PeerReviewStatus,
  approved: ReadonlySet<string> = APPROVED_LICENCES,
): { tier: AccessTier; licence: string | null } {
  const ownCopies = peerReviewStatus === 'preprint' || peerReviewStatus === 'not_peer_reviewed';
  const counted = locations.filter((l) =>
    l.isOa
    && (l.hostType !== 'repository' || l.verifiedAtHost)
    && (ownCopies || l.version === 'publishedVersion' || l.version === 'acceptedVersion'));
  const rank = (l: (typeof counted)[number]) =>
    (l.licence && approved.has(l.licence) ? 8 : 0)
    + (l.version === 'publishedVersion' ? 4 : l.version === 'acceptedVersion' ? 2 : 0)
    + (l.hostType === 'publisher' ? 1 : 0);
  const best = [...counted].sort((a, b) => rank(b) - rank(a))[0];
  if (!best) return { tier: 'metadata_only', licence: null };
  return {
    tier: best.licence && approved.has(best.licence) ? 'read_here' : 'read_at_source',
    licence: best.licence,
  };
}
