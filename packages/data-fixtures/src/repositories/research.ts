import {
  NotFoundError,
  type NewsDigestItem,
  type NewsFeedItem,
  type NewsItemDetail,
  type Paginated,
  type QueryOptions,
  type ReadContext,
  type ReportFileRef,
  type ResearchRepository,
} from '@platform/data';
import { blocked } from '../blocked';
import { paginate } from '../paginate';
import { newsFeed, newsItems } from '../fixtures';

/** The calendar day of `asOf`, which is what "today's digest" means. */
function sameDay(iso: string | null, asOf: Date): boolean {
  return iso !== null && iso.slice(0, 10) === asOf.toISOString().slice(0, 10);
}

export function createResearchRepository(): ResearchRepository {
  return {
    async listItems(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<NewsFeedItem>> {
      return paginate(newsFeed(ctx.asOf), opts);
    },

    async listTodayDigest(ctx: ReadContext, opts?: QueryOptions): Promise<NewsDigestItem[]> {
      // Worked out from `asOf` rather than stored, so the demo's digest does
      // not empty out the day after its fixtures were written. This is the
      // relative-dating rule doing the thing it exists for.
      const today = newsFeed(ctx.asOf)
        .filter((item) => sameDay(item.publishedAt, ctx.asOf))
        .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

      return paginate(today, opts).items.map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        category: item.category,
        sourceName: item.sourceName,
        publishedAt: item.publishedAt,
        summary: item.summary,
      }));
    },

    async getItem(ctx: ReadContext, id: string): Promise<NewsItemDetail> {
      const item = newsItems(ctx.asOf).find((row) => row.id === id);
      // Rejects rather than returning null, matching the live adapter — the
      // contract's `expectNotFound` checks the entity and id, so a demo 404
      // says which article it could not find.
      if (!item) throw new NotFoundError('news_item', id);
      return item;
    },

    async getReportFile(): Promise<ReportFileRef> {
      // No fixture carries a stored artefact yet: Storage stays on the raw
      // client, so there is nothing for the demo to sign a URL against. The
      // panel renders without a download rather than with a broken one.
      return { storagePath: null, fileName: null };
    },

    async setItemStatus(): Promise<void> {
      return blocked('setItemStatus', 'news_items');
    },

    async setReportCuratorNote(): Promise<void> {
      return blocked('setReportCuratorNote', 'reports');
    },

    async promoteItem(): Promise<void> {
      return blocked('promoteItem', 'knowledge_items');
    },
  };
}
