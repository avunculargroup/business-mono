import { supabase } from '../client.js';
import { DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';
import type { NewsCategory, NewsItemRecord } from '@platform/shared';

export interface NewsVectorSearchResult {
  id: string;
  title: string;
  summary: string | null;
  category: NewsCategory;
  published_at: string | null;
  url: string;
  similarity: number;
}

export interface NewsFulltextSearchResult {
  id: string;
  title: string;
  summary: string | null;
  category: NewsCategory;
  published_at: string | null;
  url: string;
  source_name: string;
}

export async function newsVectorSearch(
  queryEmbedding: number[],
  options: {
    threshold?: number;
    count?: number;
    category?: NewsCategory;
    days?: number;
  } = {},
): Promise<NewsVectorSearchResult[]> {
  const { threshold = 0.7, count = 20, category, days = 30 } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('vector_search_news', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: count,
    filter_category: category ?? null,
    filter_days: days,
  });

  if (error) throw new Error(`News vector search failed: ${error.message}`);
  return (data ?? []) as NewsVectorSearchResult[];
}

export async function newsFulltextSearch(
  query: string,
  options: {
    category?: NewsCategory;
    days?: number;
    limit?: number;
  } = {},
): Promise<NewsFulltextSearchResult[]> {
  const { category, days = 30, limit = 20 } = options;

  let q = supabase
    .from('news_items')
    .select('id, title, summary, category, published_at, url, source_name')
    .textSearch('fts', query, { type: 'websearch' })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (category) q = q.eq('category', category);
  if (days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte('fetched_at', since);
  }

  const { data, error } = await q;
  if (error) throw new Error(`News fulltext search failed: ${error.message}`);
  return (data ?? []) as NewsFulltextSearchResult[];
}

export async function newsDailyDigest(
  date?: Date,
): Promise<Record<NewsCategory, NewsItemRecord[]>> {
  const { start, end } = dayBoundsInTz(DEFAULT_TIMEZONE, date);

  const { data, error } = await supabase
    .from('news_items')
    .select('*')
    .gte('fetched_at', start.toISOString())
    .lt('fetched_at', end.toISOString())
    .neq('status', 'archived')
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw new Error(`News daily digest failed: ${error.message}`);

  const grouped: Record<string, NewsItemRecord[]> = {
    regulatory:    [],
    corporate:     [],
    macro:         [],
    international: [],
  };

  for (const item of data ?? []) {
    const cat = item.category as NewsCategory;
    const bucket = grouped[cat] ?? [];
    if (bucket.length < 5) {
      bucket.push({
        ...(item as unknown as NewsItemRecord),
        key_points: (item.key_points as string[]) ?? [],
        topic_tags: item.topic_tags ?? [],
      });
      grouped[cat] = bucket;
    }
  }

  return grouped as Record<NewsCategory, NewsItemRecord[]>;
}
