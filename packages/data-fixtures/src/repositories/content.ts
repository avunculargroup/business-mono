import type {
  ContentCard,
  ContentDetail,
  ContentEditGuard,
  ContentRepository,
  Paginated,
  PublishGate,
  QueryOptions,
  ReadContext,
  SocialDraftCopy,
} from '@platform/data';
import { blocked } from '../blocked';
import { paginate } from '../paginate';
import { contentCards, contentDetails, publishGates } from '../fixtures';

export function createContentRepository(): ContentRepository {
  return {
    async listCards(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<ContentCard>> {
      return paginate(contentCards(ctx.asOf), opts);
    },

    async getDetail(ctx: ReadContext, idOrSlug: string): Promise<ContentDetail | null> {
      // Id or slug, resolved here for the same reason the live adapter resolves
      // it: how a row is addressed is the adapter's business.
      const card = contentCards(ctx.asOf).find((row) => row.id === idOrSlug || row.slug === idOrSlug);
      if (!card) return null;

      return contentDetails(ctx.asOf).find((row) => row.id === card.id) ?? null;
    },

    async getSocialDraftCopy(ctx: ReadContext, id: string): Promise<SocialDraftCopy | null> {
      const detail = contentDetails(ctx.asOf).find((row) => row.id === id);
      if (!detail || detail.socialAccountId === null) return null;

      return {
        title: detail.title,
        platform: 'linkedin',
        accountName: null,
        body: detail.body,
        isThread: detail.isThread,
        segments: detail.threadSegments.map((segment) => segment.body),
        disclaimerText: null,
      };
    },

    async getPublishGate(ctx: ReadContext, id: string): Promise<PublishGate | null> {
      // Each fixture carries its own gate, because the gate is where the
      // compliance verdict lives: `ContentCard` has a status but no
      // `complianceStatus`, so the flagged draft looks like any other item in
      // review until something asks to publish it. Deriving a passing gate from
      // the row instead would describe `publish-gate` as satisfied everywhere,
      // which is the opposite of showing that the gate exists.
      return publishGates(ctx.asOf)[id] ?? null;
    },

    async getEditGuard(ctx: ReadContext, id: string): Promise<ContentEditGuard | null> {
      const detail = contentDetails(ctx.asOf).find((row) => row.id === id);
      if (!detail) return null;

      return {
        status: detail.status,
        isThread: detail.isThread,
        isPublishLocked: false,
      };
    },

    async createItem(): Promise<void> {
      return blocked('createItem', 'content_items');
    },

    async updateBody(): Promise<void> {
      return blocked('updateBody', 'content_items');
    },

    async setStatus(): Promise<void> {
      return blocked('setStatus', 'content_items');
    },

    async schedule(): Promise<void> {
      return blocked('schedule', 'content_items');
    },

    async addDraftFeedback(): Promise<boolean> {
      return blocked('addDraftFeedback', 'content_feedback');
    },
  };
}
