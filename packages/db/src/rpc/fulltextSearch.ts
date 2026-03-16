import { supabase } from '../client.js';

export interface FulltextSearchResult {
  id: string;
  title: string;
  summary: string | null;
  rank: number;
}

export async function fulltextSearch(
  query: string,
  options: {
    limit?: number;
  } = {}
): Promise<FulltextSearchResult[]> {
  const { limit = 10 } = options;

  const { data, error } = await supabase
    .from('knowledge_items')
    .select('id, title, summary')
    .textSearch('fts', query, { type: 'websearch' })
    .limit(limit);

  if (error) throw new Error(`Fulltext search failed: ${error.message}`);

  return (data ?? []).map((item, index) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    rank: index,
  }));
}
