import type {
  NewsCategory,
  NewsStatus,
  ReportExtractionMethod,
  ReportExtractionQuality,
  ReportFileFormat,
  ReportRedistribution,
  ReportType,
} from '@platform/shared';
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

/**
 * The stored artefact behind a `report_watch` item.
 *
 * `reports` carries the extracted `body` too — the whole text of a document
 * that can run to 200 pages — and the feed item already holds it, so the panel
 * never reads it and the adapter never fetches it.
 */
export interface NewsReport {
  id: string;
  reportType: ReportType;
  publisher: string | null;
  publishedAt: string | null;
  publishedAtSource: 'pdf_metadata' | 'scraped' | 'http_last_modified' | null;
  pageCount: number | null;
  wordCount: number | null;
  fileFormat: ReportFileFormat;
  fileSizeBytes: number | null;
  contentHash: string;
  extractionMethod: ReportExtractionMethod | null;
  extractionQuality: ReportExtractionQuality | null;
  ocrUsed: boolean;
  redistribution: ReportRedistribution;
  licenceNotes: string | null;
  curatorNote: string | null;
  storagePath: string | null;
  createdAt: string;
  /** True when the publisher changed the document after it was first stored. */
  isRevision: boolean;
  /**
   * The feed item of the version this supersedes, when there is one to link to.
   * Null on a revision whose predecessor was never surfaced as a feed item —
   * which is why `isRevision` is a separate field rather than inferred from
   * this one: the notice is still shown, without a link.
   */
  supersededItemId: string | null;
}

/** One article, read on its own page. */
export interface NewsItemDetail {
  id: string;
  title: string;
  url: string;
  /** The publisher's hosted copy, for items whose `url` is synthetic. */
  canonicalUrl: string | null;
  /**
   * Resolved from `news_sources` when the item has one, falling back to the
   * name denormalised onto the row — which can be stale.
   */
  sourceName: string;
  author: string | null;
  publishedAt: string | null;
  summary: string | null;
  category: NewsCategory;
  relevanceScore: number | null;
  curatorNotes: string | null;
  topicTags: string[];
  bodyMarkdown: string | null;
  /** Set only for `report_watch` items. */
  report: NewsReport | null;
}

/** What the download action needs to mint a signed URL. */
export interface ReportFileRef {
  storagePath: string | null;
  fileName: string | null;
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

  /**
   * One article with everything its page renders, or `NotFoundError`.
   *
   * Returns the resolved source name and the report panel in one call: the page
   * needed three round trips to assemble them, and which ones it needed
   * depended on the row it had just read.
   */
  getItem(ctx: ReadContext, id: string): Promise<NewsItemDetail>;

  /**
   * Where a report's stored artefact lives.
   *
   * Split from the signed-URL mint on purpose. Minting is a Storage operation,
   * and Storage stays on the raw client for the same reason auth does — it is
   * not data, and there is nothing for a fixture adapter to stand in for. What
   * a fixture adapter can answer is which artefact a report points at, which is
   * this.
   */
  getReportFile(id: string): Promise<ReportFileRef>;

  /** Write — throws `DemoWriteBlockedError` in fixtures. */
  setItemStatus(id: string, status: NewsStatus): Promise<void>;

  /** Write — the curator's note on a report. */
  setReportCuratorNote(id: string, note: string): Promise<void>;

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
