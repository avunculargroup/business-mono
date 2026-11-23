// ============================================================
// Deterministic classification — peer review and a first relevance pass
// ============================================================
// No index publishes a reliable peer-review flag, so it is inferred from the
// venue, the work type and whether the work is a draft. Relevance gets a
// deterministic first pass here; Rex confirms every band except a clear
// exclude (confirmRelevance.ts), and a person can override either.
// Spec: docs/features/client-app/library-papers-spec.md#5-peer-review-is-not-a-field-anyone-publishes
//       docs/features/client-app/library-papers-spec.md#relevance-tiers

import type { PeerReviewStatus, RelevanceTier, VenueType } from './types.js';

export interface PeerReviewInput {
  /** OpenAlex type: 'article', 'review', 'preprint', 'editorial'… */
  workType: string | null;
  crossrefType: string | null;
  venueType: VenueType | null;
  isDraft: boolean;
}

export interface PeerReviewResult {
  status: PeerReviewStatus;
  /** e.g. 'venue:journal+type:article'. Stored as papers.peer_review_basis. */
  basis: string;
}

const NEVER_REFEREED = new Set([
  'editorial', 'letter', 'erratum', 'paratext', 'retraction', 'peer-review', 'libguides',
  'supplementary-materials', 'dataset', 'report', 'dissertation', 'standard', 'grant', 'other',
  // A monograph is outside the register's scope (journal articles, refereed
  // proceedings, refereed chapters), whoever published it.
  'book',
]);
// OpenAlex types proceedings papers 'conference-paper' (LNCS, IEEE S&P in the
// first backfill sample); in computer science the conferences are the journals.
const REFEREED_TYPES = new Set(['article', 'review', 'book-chapter', 'conference-paper']);
const REFEREED_VENUES = new Set<VenueType>(['journal', 'conference', 'book_series']);

export function classifyPeerReview(input: PeerReviewInput): PeerReviewResult {
  const type = input.workType ?? 'unknown';
  const venue = input.venueType ?? 'none';
  if (input.isDraft || type === 'preprint' || input.crossrefType === 'posted-content') {
    return { status: 'preprint', basis: `draft+type:${type}` };
  }
  if (NEVER_REFEREED.has(type)) return { status: 'not_peer_reviewed', basis: `type:${type}` };
  if (input.venueType === 'repository') return { status: 'not_peer_reviewed', basis: `venue:repository+type:${type}` };
  if (REFEREED_TYPES.has(type) && input.venueType && REFEREED_VENUES.has(input.venueType)) {
    return { status: 'peer_reviewed', basis: `venue:${venue}+type:${type}` };
  }
  return { status: 'unknown', basis: `venue:${venue}+type:${type}` };
}

// ── Relevance ───────────────────────────────────────────────────────────────

export type RelevanceBand = 'clear_exclude' | 'likely_core' | 'likely_substantial' | 'likely_peripheral';

export interface RelevanceScores {
  band: RelevanceBand;
  titleBitcoin: number;
  abstractBitcoin: number;
  titleCrypto: number;
  abstractCrypto: number;
  otherAssets: number;
  abstractWords: number;
}

const BITCOIN = /\bbitcoins?\b|\bbtc\b/gi;
// Crypto-generic papers whose findings apply to bitcoin count as substantial
// (decided 11 October 2026), so these keep a paper out of the clear-exclude band.
const CRYPTO = /\bcrypto-?currenc(?:y|ies)\b|\bcrypto-?assets?\b|\bdigital assets?\b|\bvirtual currenc(?:y|ies)\b|\bdigital currenc(?:y|ies)\b|\bblockchains?\b/gi;
const OTHER_ASSETS = /\bethereum\b|\bether\b|\blitecoin\b|\bripple\b|\bxrp\b|\bdogecoin\b|\bsolana\b|\bstablecoins?\b|\btether\b|\bnfts?\b|\bdefi\b|\baltcoins?\b/gi;

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

/**
 * Term density over title and abstract. A work that names neither bitcoin nor
 * crypto-assets at all is a clear exclude and never reaches Rex; everything
 * else is a band for Rex to confirm or correct.
 */
export function scoreRelevance(title: string, abstract: string | null): RelevanceScores {
  const a = abstract ?? '';
  const scores = {
    titleBitcoin: count(BITCOIN, title),
    abstractBitcoin: count(BITCOIN, a),
    titleCrypto: count(CRYPTO, title),
    abstractCrypto: count(CRYPTO, a),
    otherAssets: count(OTHER_ASSETS, `${title} ${a}`),
    abstractWords: a ? a.split(/\s+/).filter(Boolean).length : 0,
  };
  let band: RelevanceBand;
  if (scores.titleBitcoin + scores.abstractBitcoin + scores.titleCrypto + scores.abstractCrypto === 0) {
    band = 'clear_exclude';
  } else if (scores.titleBitcoin > 0) {
    band = 'likely_core';
  } else if (scores.abstractBitcoin >= 2 || scores.titleCrypto > 0) {
    band = 'likely_substantial';
  } else {
    band = 'likely_peripheral';
  }
  return { band, ...scores };
}

/** The tier a band stands for, used when Rex is skipped or fails. */
export function tierForBand(band: RelevanceBand): RelevanceTier {
  switch (band) {
    case 'clear_exclude': return 'excluded';
    case 'likely_core': return 'core';
    case 'likely_substantial': return 'substantial';
    case 'likely_peripheral': return 'peripheral';
  }
}
