import type { ContentStatus } from '@platform/shared';
import type {
  ContentCard,
  ContentEditGuard,
  ContentRepository,
  NewContentItem,
  Paginated,
  PublishGate,
  QueryOptions,
  ReadContext,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

/**
 * The board's columns, with the campaign and account names embedded.
 *
 * One unbroken literal — see the note in `research.ts` about `supabase-js`
 * parsing this at the type level.
 */
const CARD_COLUMNS =
  'id, slug, title, type, status, scheduled_for, publish_error, created_by, campaign_id, social_account_id, campaigns(name), social_accounts(display_name, platform)' as const;

const GATE_COLUMNS =
  'status, type, body, approved_by, compliance_status, is_thread, social_account_id' as const;

const EDIT_GUARD_COLUMNS =
  'status, is_thread, campaign_id, social_account_id, publish_locked_at' as const;

/** The board has never paged; it renders every card in six columns. */
const CARD_LIMIT = 500;

type CardRow = {
  id: string;
  slug: string;
  title: string | null;
  type: string;
  status: string;
  scheduled_for: string | null;
  publish_error: string | null;
  created_by: string | null;
  campaigns: { name: string } | null;
  social_accounts: { display_name: string | null; platform: string | null } | null;
};

function toCard(row: CardRow): ContentCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    status: row.status as ContentStatus,
    scheduledFor: row.scheduled_for,
    publishError: row.publish_error,
    createdBy: row.created_by,
    campaignName: row.campaigns?.name ?? null,
    accountName: row.social_accounts?.display_name ?? null,
    platform: row.social_accounts?.platform ?? null,
  };
}

export function createContentRepository(adapter: SupabaseAdapterContext): ContentRepository {
  const { client } = adapter;

  return {
    async listCards(_ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<ContentCard>> {
      const limit = opts?.limit ?? CARD_LIMIT;
      const offset = opts?.offset ?? 0;

      const { data, count, error } = await client
        .from('content_items')
        .select(CARD_COLUMNS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = ((data ?? []) as unknown as CardRow[]).map(toCard);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async getPublishGate(_ctx: ReadContext, id: string): Promise<PublishGate | null> {
      const { data: item, error } = await client
        .from('content_items')
        .select(GATE_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!item) return null;

      // Both lookups depend on the item, and neither depends on the other. The
      // credential is per-account, so there is nothing to ask for when the post
      // is not linked to one yet.
      const [credential, spec] = await Promise.all([
        item.social_account_id
          ? client
              .from('social_credentials')
              .select('expires_at')
              .eq('social_account_id', item.social_account_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        client.from('platform_specs').select('max_chars').eq('platform', item.type).maybeSingle(),
      ]);

      return {
        status: item.status as ContentStatus,
        type: item.type,
        body: item.body,
        isThread: item.is_thread ?? false,
        approvedBy: item.approved_by,
        complianceStatus: item.compliance_status,
        socialAccountId: item.social_account_id,
        credentialExpiresAt: credential.data?.expires_at ?? null,
        maxChars: spec.data?.max_chars ?? null,
      };
    },

    async getEditGuard(_ctx: ReadContext, id: string): Promise<ContentEditGuard | null> {
      const { data, error } = await client
        .from('content_items')
        .select(EDIT_GUARD_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        status: data.status as ContentStatus,
        isThread: data.is_thread ?? false,
        isPublishLocked: data.publish_locked_at !== null,
      };
    },

    async createItem(input: NewContentItem): Promise<void> {
      const { error } = await client.from('content_items').insert({
        title: input.title,
        type: input.type,
        body: input.body,
        status: input.status,
        scheduled_for: input.scheduledFor,
        published_at: null,
        author_id: input.authorId,
        knowledge_item_ids: null,
        iteration_count: 0,
      });

      if (error) throw error;
    },

    async updateBody(id: string, input: { title?: string; body: string }): Promise<void> {
      // Re-read the link fields rather than take them from the caller: whether
      // a cleared compliance verdict survives an edit is an invariant, and a
      // caller that forgot to pass a flag would silently break it.
      const { data: existing, error: readError } = await client
        .from('content_items')
        .select('campaign_id, social_account_id')
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;

      const update: Record<string, unknown> = {
        body: input.body || null,
        char_count: input.body.length,
      };
      if (input.title !== undefined) update.title = input.title || null;
      if (existing?.campaign_id || existing?.social_account_id) {
        update.compliance_status = 'pending';
        update.compliance_checked_at = null;
      }

      const { error } = await client.from('content_items').update(update).eq('id', id);
      if (error) throw error;
    },

    async setStatus(id: string, status: ContentStatus): Promise<void> {
      const { error } = await client.from('content_items').update({ status }).eq('id', id);
      if (error) throw error;
    },

    async schedule(id: string, when: Date): Promise<void> {
      const { error } = await client
        .from('content_items')
        .update({
          status: 'scheduled',
          scheduled_for: when.toISOString(),
          // A re-schedule has to clear the previous failure, or the card keeps
          // showing an error for an attempt that is no longer pending.
          publish_error: null,
          publish_attempts: 0,
          publish_locked_at: null,
        })
        .eq('id', id);

      if (error) throw error;
    },
  };
}
