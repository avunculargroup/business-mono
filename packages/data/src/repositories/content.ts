import type { ContentStatus, ImageConcept } from '@platform/shared';
import type { Paginated, QueryOptions, ReadContext } from '../context';

/** One card on the pipeline board. */
export interface ContentCard {
  id: string;
  slug: string;
  title: string | null;
  type: string;
  status: ContentStatus;
  scheduledFor: string | null;
  publishError: string | null;
  createdBy: string | null;
  /** Resolved from the linked campaign and social account, not stored. */
  campaignName: string | null;
  accountName: string | null;
  platform: string | null;
}

/**
 * Everything the publish gate needs to decide, in one read.
 *
 * The rules and their wording stay in `app/actions/content.ts`: they are
 * user-facing copy governed by the brand voice, and a data layer is the wrong
 * place for a sentence a director reads. What lives here is the *facts* the
 * rules are evaluated against, gathered across `content_items`,
 * `social_credentials` and `platform_specs` so a fixture adapter can answer the
 * same question without reproducing three queries.
 */
export interface PublishGate {
  status: ContentStatus;
  type: string;
  body: string | null;
  isThread: boolean;
  approvedBy: string | null;
  complianceStatus: string | null;
  socialAccountId: string | null;
  /** Null when the account has no stored credential at all. */
  credentialExpiresAt: string | null;
  /** The platform's character limit, when it publishes one. */
  maxChars: number | null;
}

/** The three states that block a manual edit. */
export interface ContentEditGuard {
  status: ContentStatus;
  isThread: boolean;
  /** True while the publish poller holds the row. */
  isPublishLocked: boolean;
}

export interface ThreadSegment {
  id: string;
  body: string;
}

export interface DraftFeedbackEntry {
  id: string;
  verdict: 'positive' | 'negative' | null;
  feedback: string;
  createdAt: string;
}

/** Lex's advisory verdict on an image's alt text. */
export interface ContentImageVerdict {
  classification: string;
  rationale: string;
  checkedAt: string | null;
}

/**
 * An image on a draft. A run renders up to three candidates (one generation
 * group each, sharing a candidate set); exactly one is selected, and the
 * selected one is the draft's image everywhere it is consumed. An AI image also
 * carries its provenance — the concept, the exact prompt sent, the canon
 * version, model and cost — so the page can say exactly what produced it.
 */
export interface ContentImage {
  id: string;
  source: 'upload' | 'ai_generated';
  /** The platform crop, marked. What gets posted. */
  storagePath: string;
  /** The unmarked render, for promoting to a style anchor. Null for uploads. */
  masterPath: string | null;
  /** Shared by every crop of one render; regenerate and remove act on it. */
  generationGroupId: string | null;
  altText: string | null;
  platformCrop: string | null;
  /** The concept it was rendered from (canon v1.1+); null for v1.0 images and uploads. */
  brief: ImageConcept | null;
  /** The idea the image carries, shown so a founder judges the idea and not just the drawing. */
  tension: string | null;
  /** Canon v1.1+ layout key. */
  layout: string | null;
  /** Canon v1.0 motif key, for images made before v1.1. */
  motifKey: string | null;
  /** The reviewer's one-line note on the idea; null before the reviewer, on a fallback, or for a founder's own brief. */
  reviewNote: string | null;
  /** Shared by every candidate of one run; null for images made before candidates. */
  candidateSetId: string | null;
  candidateIndex: number | null;
  isSelected: boolean;
  assembledPrompt: string | null;
  brandVisualVersion: string | null;
  modelId: string | null;
  costUsd: number | null;
  isStyleAnchor: boolean;
  altTextVerdict: ContentImageVerdict | null;
  createdAt: string;
}

/** The newest founder image action on a draft, so the page can show progress. */
export interface ContentImageRequest {
  id: string;
  action: 'regenerate' | 'render_brief' | 'recheck_alt_text';
  status: 'pending' | 'working' | 'done' | 'failed';
  error: string | null;
  createdAt: string;
}

/**
 * A draft on its own page: the item, its segments, the feedback already left on
 * it, and the platform's character limit.
 *
 * Assembled in one read. The page ran four queries, three of them conditional
 * on what the first returned — a thread has segments, a social draft has
 * feedback, a LinkedIn post has a limit.
 */
export interface ContentDetail {
  id: string;
  title: string | null;
  type: string;
  status: ContentStatus;
  body: string | null;
  isThread: boolean;
  socialAccountId: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  publishError: string | null;
  createdAt: string;
  updatedAt: string;
  threadSegments: ThreadSegment[];
  priorFeedback: DraftFeedbackEntry[];
  maxChars: number | null;
  /** The selected image. Never an unselected candidate. */
  image: ContentImage | null;
  /** The other live candidates of the draft's current run, in brief order. */
  imageCandidates: ContentImage[];
  latestImageRequest: ContentImageRequest | null;
}

/** The copy-to-clipboard surface a social-draft email links to. */
export interface SocialDraftCopy {
  title: string | null;
  platform: 'linkedin' | 'twitter_x';
  accountName: string | null;
  body: string | null;
  isThread: boolean;
  segments: string[];
  disclaimerText: string | null;
  /** The selected image's marked platform crop to download, when the draft has one. */
  image: { storagePath: string; altText: string | null } | null;
}

export interface NewContentItem {
  title: string;
  type: string;
  body: string | null;
  status: ContentStatus;
  scheduledFor: string | null;
  authorId: string | null;
}

export interface ContentRepository {
  /** The pipeline board, newest first. */
  listCards(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<ContentCard>>;

  /**
   * One draft with everything its page renders, or null.
   *
   * Takes an id *or* a slug: which column to match is the adapter's business,
   * not the page's.
   */
  getDetail(ctx: ReadContext, idOrSlug: string): Promise<ContentDetail | null>;

  /** Null when the item is gone or is not a social draft. */
  getSocialDraftCopy(ctx: ReadContext, id: string): Promise<SocialDraftCopy | null>;

  /** Null when the item is gone, so the caller can say so in its own words. */
  getPublishGate(ctx: ReadContext, id: string): Promise<PublishGate | null>;
  getEditGuard(ctx: ReadContext, id: string): Promise<ContentEditGuard | null>;

  createItem(input: NewContentItem): Promise<void>;

  /**
   * Save a manual edit.
   *
   * Resets compliance to pending for an account- or campaign-linked draft, so
   * the recheck listener re-runs Lex. That is an invariant, not a caller's
   * choice — a cleared verdict must not survive an edit — so the adapter
   * decides it from the row rather than taking a flag.
   */
  updateBody(id: string, input: { title?: string; body: string }): Promise<void>;

  setStatus(id: string, status: ContentStatus): Promise<void>;

  /** Move an approved post into the publish queue. Gates are the caller's. */
  schedule(id: string, when: Date): Promise<void>;

  /**
   * Record feedback on a generated social draft.
   *
   * Returns false when the draft has no social account — feedback on one
   * cannot improve future posts, and the caller words that refusal. The
   * denormalised platform and post form, and the snapshot of the draft text
   * (thread segments joined), are the adapter's: they exist so the agents-side
   * distiller needs no joins, which is a fact about the data rather than about
   * the page. Who left the feedback comes from the bound principal.
   */
  addDraftFeedback(
    contentItemId: string,
    input: { feedback: string; verdict?: 'positive' | 'negative' },
  ): Promise<boolean>;
}
