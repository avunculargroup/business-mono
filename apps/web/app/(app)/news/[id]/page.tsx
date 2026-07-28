import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsItemDetail } from './NewsItemDetail';
import type { NewsItemRecord } from '@platform/shared';

export const dynamic = 'force-dynamic';

// Note: /news already has static children (daily, podcasts, sources). Next
// resolves those ahead of this dynamic segment, so there is no conflict today —
// but a future static child under /news would silently shadow this route.
export default async function NewsItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from('news_items').select('*').eq('id', id).single();
  if (!item) notFound();

  const news = item as unknown as NewsItemRecord;

  const sourceName = news.source_id
    ? await supabase
        .from('news_sources')
        .select('name')
        .eq('id', news.source_id)
        .single()
        .then((r) => (r.data as { name: string } | null)?.name ?? news.source_name)
    : news.source_name;

  return (
    <>
      <PageHeader title="Article" backHref="/news" backLabel="News feed" />
      <NewsItemDetail item={news} sourceName={sourceName} />
    </>
  );
}
