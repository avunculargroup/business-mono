import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsFeed } from '@/components/news/NewsFeed';

export default async function NewsPage() {
  const repositories = await getRepositories();
  const ctx = resolveReadContext();

  const [feed, digest] = await Promise.all([
    repositories.research.listItems(ctx),
    repositories.research.listTodayDigest(ctx, { limit: 20 }),
  ]);

  return (
    <>
      <PageHeader title="News feed" />
      <NewsFeed initialItems={feed.items} todayDigest={digest} />
    </>
  );
}
