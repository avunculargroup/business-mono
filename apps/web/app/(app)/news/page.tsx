import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsFeed } from '@/components/news/NewsFeed';
import type { NewsItemRecord } from '@platform/shared';

export default async function NewsPage() {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

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
      .gte('fetched_at', today.toISOString())
      .lt('fetched_at', tomorrow.toISOString())
      .neq('status', 'archived')
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader title="News feed" />
      <NewsFeed
        initialItems={(items ?? []) as unknown as NewsItemRecord[]}
        todayDigest={(digest ?? []) as { id: string; title: string; url: string; category: string }[]}
      />
    </>
  );
}
