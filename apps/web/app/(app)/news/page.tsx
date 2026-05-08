import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsFeed } from '@/components/news/NewsFeed';
import { DEFAULT_TIMEZONE, dayBoundsInTz } from '@platform/shared';
import type { NewsItemRecord, NewsCategory } from '@platform/shared';

export default async function NewsPage() {
  const supabase = await createClient();

  const { start, end } = dayBoundsInTz(DEFAULT_TIMEZONE);

  const [{ data: items }, { data: digest }] = await Promise.all([
    supabase
      .from('news_items')
      .select('*')
      .neq('status', 'archived')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('fetched_at', { ascending: false })
      .limit(200),
    supabase
      .from('news_items')
      .select('id, title, url, category')
      .gte('fetched_at', start.toISOString())
      .lt('fetched_at', end.toISOString())
      .neq('status', 'archived')
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader title="News feed" />
      <NewsFeed
        initialItems={(items ?? []) as unknown as NewsItemRecord[]}
        todayDigest={(digest ?? []) as unknown as { id: string; title: string; url: string; category: NewsCategory }[]}
      />
    </>
  );
}
