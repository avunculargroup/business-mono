import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsSourcesClient } from './NewsSourcesClient';
import type { NewsSourceRecord } from '@platform/shared';

export default async function NewsSourcesPage() {
  const supabase = await createClient();

  const { data: sources } = await supabase
    .from('news_sources')
    .select('*')
    .order('name', { ascending: true });

  return (
    <>
      <PageHeader title="News sources" />
      <NewsSourcesClient initialSources={(sources ?? []) as unknown as NewsSourceRecord[]} />
    </>
  );
}
