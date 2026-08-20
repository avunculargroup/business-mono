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
import { contentCards, contentDetails } from '../fixtures';

export function createContentRepository(): ContentRepository {
  return {
    async listCards(_ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<ContentCard>> {
      return paginate(contentCards(), opts);
    },

    async getDetail(ctx: ReadContext, idOrSlug: string): Promise<ContentDetail | null> {
      // Id or slug, resolved here for the same reason the live adapter resolves
      // it: how a row is addressed is the adapter's business.
      const card = contentCards().find((row) => row.id === idOrSlug || row.slug === idOrSlug);
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
      const detail = contentDetails(ctx.asOf).find((row) => row.id === id);
      if (!detail) return null;

      // Deliberately not a passing gate. Publishing is blocked in the demo
      // anyway, and a fixture that reported "cleared, approved, credentials
      // valid" would describe the `publish-gate` principle as satisfied on
      // every row — which is the opposite of showing that the gate exists.
      return {
        status: detail.status,
        type: detail.type,
        body: detail.body,
        isThread: detail.isThread,
        approvedBy: null,
        complianceStatus: 'pending',
        socialAccountId: detail.socialAccountId,
        credentialExpiresAt: null,
        maxChars: detail.maxChars,
      };
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
