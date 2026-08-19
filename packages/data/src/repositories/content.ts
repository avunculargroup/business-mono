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
}
