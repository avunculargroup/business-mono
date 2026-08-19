import type { Database } from '@platform/db';
import { DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';
import type { NewsCategory, NewsStatus } from '@platform/shared';
import type {
  NewsDigestItem,
  NewsFeedItem,
  Paginated,
  QueryOptions,
  ReadContext,
  ResearchRepository,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

type NewsRow = Database['public']['Tables']['news_items']['Row'];

/**
 * The columns the feed renders. Explicit rather than `select('*')`, which is
 * what the page did: `body_markdown` holds the full text of an ingested
 * newsletter, and the feed was pulling 200 of them to render headlines.
 *
 * One unbroken literal, not a concatenation. `supabase-js` parses the column
 * list at the type level to type the result, and a concatenated string is just
 * `string` to it — which is why the page this replaces had to cast its result
 * through `unknown`. As a literal, a typo'd column name is a type error here.
 */
const FEED_COLUMNS =
  'id, title, url, image_url, source_name, published_at, summary, category, status, relevance_score, curator_notes' as const;

const DIGEST_COLUMNS =
  'id, title, url, category, source_name, published_at, summary' as const;

/** Matches the caps the pages have always used. */
const FEED_LIMIT = 200;
const DIGEST_LIMIT = 100;

type FeedRow = Pick<
  NewsRow,
  | 'id' | 'title' | 'url' | 'image_url' | 'source_name' | 'published_at'
  | 'summary' | 'category' | 'status' | 'relevance_score' | 'curator_notes'
>;

type DigestRow = Pick<
  NewsRow,
  'id' | 'title' | 'url' | 'category' | 'source_name' | 'published_at' | 'summary'
>;

function toFeedItem(row: FeedRow): NewsFeedItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    sourceName: row.source_name,
    publishedAt: row.published_at,
    summary: row.summary,
    // `category` and `status` are text columns with CHECK constraints the
    // generated types do not carry. The database is what makes these sound.
    category: row.category as NewsCategory,
    status: row.status as NewsStatus,
    relevanceScore: row.relevance_score,
    curatorNotes: row.curator_notes,
  };
}

function toDigestItem(row: DigestRow): NewsDigestItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    category: row.category as NewsCategory,
    sourceName: row.source_name,
    publishedAt: row.published_at,
    summary: row.summary,
  };
}

export function createResearchRepository(
  adapter: SupabaseAdapterContext,
): ResearchRepository {
  const { client } = adapter;

  return {
    async listItems(
      _ctx: ReadContext,
      opts?: QueryOptions,
    ): Promise<Paginated<NewsFeedItem>> {
      const limit = opts?.limit ?? FEED_LIMIT;
      const offset = opts?.offset ?? 0;

      const { data, count, error } = await client
        .from('news_items')
        .select(FEED_COLUMNS, { count: 'exact' })
        .neq('status', 'archived')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('fetched_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = (data ?? []).map(toFeedItem);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async listTodayDigest(
      ctx: ReadContext,
      opts?: QueryOptions,
    ): Promise<NewsDigestItem[]> {
      // "Today" is anchored to the read context, not to the server clock, so a
      // fixture adapter can hold the digest steady against its own anchor date.
      const { start, end } = dayBoundsInTz(DEFAULT_TIMEZONE, ctx.asOf);

      const { data, error } = await client
        .from('news_items')
        .select(DIGEST_COLUMNS)
        .gte('fetched_at', start.toISOString())
        .lt('fetched_at', end.toISOString())
        .neq('status', 'archived')
        .order('relevance_score', { ascending: false, nullsFirst: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(opts?.limit ?? DIGEST_LIMIT);

      if (error) throw error;
      return (data ?? []).map(toDigestItem);
    },

    async setItemStatus(id: string, status: NewsStatus): Promise<void> {
      const { error } = await client.from('news_items').update({ status }).eq('id', id);
      if (error) throw error;
    },

    async promoteItem(id: string): Promise<void> {
      // Read what the knowledge item needs from the row rather than trusting a
      // caller-supplied copy, so a stale card cannot file an article under
      // another article's title.
      const { data: row, error: readError } = await client
        .from('news_items')
        .select('title, url, canonical_url, summary, category')
        .eq('id', id)
        .single();

      if (readError) throw readError;

      const { data: knowledgeItem, error: insertError } = await client
        .from('knowledge_items')
        .insert({
          title: row.title,
          // Never the synthetic `email://` url — an email item's real address
          // is its canonical_url, and null beats a link that opens nothing.
          source_url: originalUrl(row.url, row.canonical_url),
          source_type: 'article',
          summary: row.summary ?? undefined,
          archived_by: 'rex',
          topic_tags: [row.category],
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      const { error: updateError } = await client
        .from('news_items')
        .update({ status: 'promoted', knowledge_item_id: knowledgeItem.id })
        .eq('id', id);

      if (updateError) throw updateError;
    },
  };
}

/**
 * The item's real address on the public web, or null when it has none.
 *
 * Mirrors `apps/web/lib/news/itemHref.ts`'s `newsOriginalUrl`. Duplicated
 * rather than imported: that module is app code, and this package must not
 * depend on its consumer.
 */
function originalUrl(url: string, canonicalUrl: string | null): string | null {
  if (/^https?:\/\//i.test(url.trim())) return url.trim();
  if (canonicalUrl && /^https?:\/\//i.test(canonicalUrl.trim())) return canonicalUrl.trim();
  return null;
}
