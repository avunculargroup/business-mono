import type { ContentStatus } from '@platform/shared';
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
