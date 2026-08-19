import { notFound } from 'next/navigation';
import { NotFoundError } from '@platform/data';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsItemDetail } from './NewsItemDetail';

export const dynamic = 'force-dynamic';

// Note: /news already has static children (daily, podcasts, sources). Next
// resolves those ahead of this dynamic segment, so there is no conflict today —
// but a future static child under /news would silently shadow this route.
export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repositories = await getRepositories();

  // The repository assembles the item, its source name and its report panel.
  // The page used to run up to four queries here, two of which it could only
  // know it needed after reading the first.
  const item = await repositories.research.getItem(resolveReadContext(), id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });

  return (
    <>
      <PageHeader
        title={item.report ? 'Report' : 'Article'}
        backHref="/news"
        backLabel="News feed"
      />
      <NewsItemDetail item={item} />
    </>
  );
}
