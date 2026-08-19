import type { NewsCategory, NewsStatus } from '@platform/shared';
import type { Paginated, QueryOptions, ReadContext } from '../context';

/**
 * One article in the news feed.
 *
 * The fields the feed and its cards render, and no more. `news_items` carries
 * ingestion bookkeeping too — `url_hash`, `ingestion_ref`, `routine_id`,
 * `ingested_by`, `body_markdown` — which the feed has never rendered and which
 * the adapter therefore does not fetch.
 */
export interface NewsFeedItem {
  id: string;
  title: string;
  /** Synthetic `email://…` for email-sourced items; see `lib/news/itemHref.ts`. */
  url: string;
  imageUrl: string | null;
  sourceName: string;
  publishedAt: string | null;
  summary: string | null;
  category: NewsCategory;
  status: NewsStatus;
  relevanceScore: number | null;
  curatorNotes: string | null;
}

/**
 * An article in today's digest. Narrower than a feed item because the digest
 * renders a headline and a line of context, never a card.
 */
export interface NewsDigestItem {
  id: string;
  title: string;
  url: string;
  category: NewsCategory;
  sourceName: string;
  publishedAt: string | null;
  summary: string | null;
}

export interface ResearchRepository {
  /** The feed, newest first. Archived items are excluded. */
  listItems(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<NewsFeedItem>>;

  /**
   * Today's items, most relevant first.
   *
   * "Today" is the calendar day of `ctx.asOf` in the platform timezone, worked
   * out by the adapter — which is what stops the demo's digest emptying out the
   * day after its fixtures were written.
   */
  listTodayDigest(ctx: ReadContext, opts?: QueryOptions): Promise<NewsDigestItem[]>;

  /** Write — throws `DemoWriteBlockedError` in fixtures. */
  setItemStatus(id: string, status: NewsStatus): Promise<void>;

  /**
   * Promote an article into the knowledge base and mark it promoted.
   *
   * Takes only the id: the adapter reads what the knowledge item needs from the
   * row, so a caller cannot promote one article under another's title. Note
   * that this writes to `knowledge_items` as well as `news_items` — a
   * deliberate cross-domain write, because "promote this article" is one user
   * action and splitting it across two repositories would put the ordering and
   * the half-done state on the caller. Revisit when the knowledge vertical
   * lands.
   */
  promoteItem(id: string): Promise<void>;
}
