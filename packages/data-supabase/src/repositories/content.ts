import type { ContentStatus } from '@platform/shared';
import type {
  ContentCard,
  ContentDetail,
  ContentEditGuard,
  ContentRepository,
  NewContentItem,
  Paginated,
  DraftFeedbackEntry,
  PublishGate,
  QueryOptions,
  ReadContext,
  SocialDraftCopy,
  ThreadSegment,
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

const DETAIL_COLUMNS =
  'id, title, type, status, body, is_thread, social_account_id, scheduled_for, published_at, publish_error, created_at, updated_at' as const;

/** The excerpt the distiller reads. Long enough to judge, short enough to store. */
const EXCERPT_MAX = 500;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function readThreadSegments(
  client: SupabaseAdapterContext['client'],
  contentItemId: string,
): Promise<ThreadSegment[]> {
  const { data, error } = await client
    .from('thread_segments')
    .select('id, body')
    .eq('content_item_id', contentItemId)
    .order('sequence', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function readDraftFeedback(
  client: SupabaseAdapterContext['client'],
  contentItemId: string,
): Promise<DraftFeedbackEntry[]> {
  const { data, error } = await client
    .from('content_feedback')
    .select('id, verdict, feedback, created_at')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    verdict: row.verdict as DraftFeedbackEntry['verdict'],
    feedback: row.feedback,
    createdAt: row.created_at,
  }));
}

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
  const { client, principal } = adapter;

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

    async getDetail(_ctx: ReadContext, idOrSlug: string): Promise<ContentDetail | null> {
      const { data: item, error } = await client
        .from('content_items')
        .select(DETAIL_COLUMNS)
        // A card links by slug, an email links by id. Which column that is, is
        // a fact about the data, so the page no longer has to work it out.
        .eq(isUuid(idOrSlug) ? 'id' : 'slug', idOrSlug)
        .maybeSingle();

      if (error) throw error;
      if (!item) return null;

      // Three reads that each depend on what the item turned out to be, and on
      // nothing else — so they go together rather than in sequence.
      const [segments, feedback, spec] = await Promise.all([
        item.is_thread ? readThreadSegments(client, item.id) : Promise.resolve([]),
        item.social_account_id ? readDraftFeedback(client, item.id) : Promise.resolve([]),
        client.from('platform_specs').select('max_chars').eq('platform', item.type).maybeSingle(),
      ]);

      return {
        id: item.id,
        title: item.title,
        type: item.type,
        status: item.status as ContentStatus,
        body: item.body,
        isThread: item.is_thread ?? false,
        socialAccountId: item.social_account_id,
        scheduledFor: item.scheduled_for,
        publishedAt: item.published_at,
        publishError: item.publish_error,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        threadSegments: segments,
        priorFeedback: feedback,
        maxChars: spec.data?.max_chars ?? null,
      };
    },

    async getSocialDraftCopy(
      _ctx: ReadContext,
      id: string,
    ): Promise<SocialDraftCopy | null> {
      const { data: item, error } = await client
        .from('content_items')
        .select('id, title, body, type, is_thread, social_account_id, disclaimer_snippet_id')
        .eq('id', id)
        // This surface only exists for the two social platforms; anything else
        // reads as not found rather than rendering an empty copy box.
        .in('type', ['linkedin', 'twitter_x'])
        .maybeSingle();

      if (error) throw error;
      if (!item) return null;

      const [account, segments, disclaimer] = await Promise.all([
        item.social_account_id
          ? client
              .from('social_accounts')
              .select('display_name')
              .eq('id', item.social_account_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        item.is_thread
          ? client
              .from('thread_segments')
              .select('body')
              .eq('content_item_id', item.id)
              .order('sequence', { ascending: true })
          : Promise.resolve({ data: null }),
        item.disclaimer_snippet_id
          ? client
              .from('compliance_snippets')
              .select('body')
              .eq('id', item.disclaimer_snippet_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        title: item.title,
        platform: item.type as 'linkedin' | 'twitter_x',
        accountName: account.data?.display_name ?? null,
        body: item.body,
        isThread: item.is_thread ?? false,
        segments: (segments.data ?? []).map((segment) => segment.body),
        disclaimerText: disclaimer.data?.body ?? null,
      };
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

    async addDraftFeedback(
      contentItemId: string,
      input: { feedback: string; verdict?: 'positive' | 'negative' },
    ): Promise<boolean> {
      const { data: item, error: readError } = await client
        .from('content_items')
        .select('id, type, body, is_thread, social_account_id, post_form')
        .eq('id', contentItemId)
        .maybeSingle();

      if (readError) throw readError;
      if (!item?.social_account_id) return false;

      // Snapshot the draft as it reads now. A thread's text lives on its
      // segments, so they are joined before the excerpt is cut.
      let draftText = item.body ?? '';
      if (item.is_thread) {
        const segments = await readThreadSegments(client, item.id);
        const joined = segments.map((segment) => segment.body).join(' ');
        if (joined) draftText = joined;
      }

      const { error } = await client.from('content_feedback').insert({
        content_item_id: item.id,
        social_account_id: item.social_account_id,
        // Denormalised so the agents-side distiller needs no joins — the
        // insert itself wakes it through Realtime.
        platform: item.type,
        post_form: item.post_form ?? null,
        verdict: input.verdict ?? null,
        feedback: input.feedback.trim(),
        draft_excerpt: draftText ? draftText.slice(0, EXCERPT_MAX) : null,
        created_by: principal.userId,
      });

      if (error) throw error;
      return true;
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
