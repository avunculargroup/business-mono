import type { Database } from '@platform/db';
import { DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';
import type { NewsCategory, NewsStatus, ReportRecord } from '@platform/shared';
import type {
  NewsDigestItem,
  NewsFeedItem,
  NewsItemDetail,
  NewsReport,
  Paginated,
  QueryOptions,
  ReadContext,
  ReportFileRef,
  ResearchRepository,
} from '@platform/data';
import { NotFoundError } from '@platform/data';
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

const DETAIL_COLUMNS =
  'id, title, url, canonical_url, source_id, source_name, author, published_at, summary, category, relevance_score, curator_notes, topic_tags, body_markdown, report_id' as const;

/**
 * `reports` is absent from the generated `Database` types until
 * `pnpm --filter @platform/db generate-types` runs against the migrated
 * database. The cast is confined to this constant and the row type below, so
 * the pages that used to carry it each no longer do.
 */
const REPORTS_TABLE = 'reports' as never;

const REPORT_COLUMNS =
  'id, report_type, publisher, published_at, published_at_source, page_count, word_count, file_format, file_size_bytes, content_hash, extraction_method, extraction_quality, ocr_used, redistribution, licence_notes, curator_note, storage_path, revision_of_report_id, created_at' as const;

type ReportRow = Pick<
  ReportRecord,
  | 'id' | 'report_type' | 'publisher' | 'published_at' | 'published_at_source'
  | 'page_count' | 'word_count' | 'file_format' | 'file_size_bytes'
  | 'content_hash' | 'extraction_method' | 'extraction_quality' | 'ocr_used'
  | 'redistribution' | 'licence_notes' | 'curator_note' | 'storage_path'
  | 'revision_of_report_id' | 'created_at'
>;

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

    async getItem(_ctx: ReadContext, id: string): Promise<NewsItemDetail> {
      const { data: row, error } = await client
        .from('news_items')
        .select(DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!row) throw new NotFoundError('news item', id);

      const [sourceName, report] = await Promise.all([
        resolveSourceName(client, row.source_id, row.source_name),
        // `report_id` is null for every item that is not a report_watch find,
        // so the extra reads cost nothing for the rest of the feed.
        row.report_id ? loadReport(client, row.report_id) : Promise.resolve(null),
      ]);

      return {
        id: row.id,
        title: row.title,
        url: row.url,
        canonicalUrl: row.canonical_url,
        sourceName,
        author: row.author,
        publishedAt: row.published_at,
        summary: row.summary,
        category: row.category as NewsCategory,
        relevanceScore: row.relevance_score,
        curatorNotes: row.curator_notes,
        topicTags: row.topic_tags ?? [],
        bodyMarkdown: row.body_markdown,
        report,
      };
    },

    async getReportFile(id: string): Promise<ReportFileRef> {
      const { data, error } = await client
        .from(REPORTS_TABLE)
        .select('storage_path, file_name')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new NotFoundError('report', id);

      const row = data as unknown as { storage_path: string | null; file_name: string | null };
      return { storagePath: row.storage_path, fileName: row.file_name };
    },

    async setReportCuratorNote(id: string, note: string): Promise<void> {
      const { error } = await client
        .from(REPORTS_TABLE)
        .update({ curator_note: note.trim() || null } as never)
        .eq('id', id);

      if (error) throw error;
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
 * The source's current name, or the name denormalised onto the item.
 *
 * The row's `source_name` is written at ingest and goes stale when a source is
 * renamed, so the configured source wins where there is one.
 */
async function resolveSourceName(
  client: SupabaseAdapterContext['client'],
  sourceId: string | null,
  fallback: string,
): Promise<string> {
  if (!sourceId) return fallback;

  const { data, error } = await client
    .from('news_sources')
    .select('name')
    .eq('id', sourceId)
    .maybeSingle();

  // A missing or unreadable source is not a reason to fail the page — the item
  // carries a usable name of its own.
  if (error || !data) return fallback;
  return data.name;
}

async function loadReport(
  client: SupabaseAdapterContext['client'],
  reportId: string,
): Promise<NewsReport | null> {
  const { data, error } = await client
    .from(REPORTS_TABLE)
    .select(REPORT_COLUMNS)
    .eq('id', reportId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as ReportRow;

  return {
    id: row.id,
    reportType: row.report_type,
    publisher: row.publisher,
    publishedAt: row.published_at,
    publishedAtSource: row.published_at_source,
    pageCount: row.page_count,
    wordCount: row.word_count,
    fileFormat: row.file_format,
    fileSizeBytes: row.file_size_bytes,
    contentHash: row.content_hash,
    extractionMethod: row.extraction_method,
    extractionQuality: row.extraction_quality,
    ocrUsed: row.ocr_used,
    redistribution: row.redistribution,
    licenceNotes: row.licence_notes,
    curatorNote: row.curator_note,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    isRevision: row.revision_of_report_id !== null,
    supersededItemId: row.revision_of_report_id
      ? await resolveSupersededItemId(client, row.revision_of_report_id)
      : null,
  };
}

/** The feed item of the version a revision supersedes, when it has one. */
async function resolveSupersededItemId(
  client: SupabaseAdapterContext['client'],
  priorReportId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from(REPORTS_TABLE)
    .select('news_item_id')
    .eq('id', priorReportId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as unknown as { news_item_id: string | null }).news_item_id;
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
