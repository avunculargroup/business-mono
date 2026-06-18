import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsSourcesClient, type SourceStats } from './NewsSourcesClient';
import { RESEARCH_INBOUND_DOMAIN } from '@/lib/news/emailSource';
import type { NewsSourceRecord } from '@platform/shared';

export default async function NewsSourcesPage() {
  const supabase = await createClient();

  const [{ data: sources }, { data: episodes }] = await Promise.all([
    supabase.from('news_sources').select('*').order('name', { ascending: true }),
    // Per-source episode + transcript-coverage counts for the feed list. Small
    // data set (pre-revenue), so aggregate in JS rather than via an RPC.
    supabase.from('podcast_episodes').select('source_id, transcript_status'),
  ]);

  const stats: Record<string, SourceStats> = {};
  for (const ep of episodes ?? []) {
    const id = (ep as { source_id: string | null }).source_id;
    if (!id) continue;
    const row = (stats[id] ??= { episodes: 0, available: 0 });
    row.episodes += 1;
    if ((ep as { transcript_status: string }).transcript_status === 'available') row.available += 1;
  }

  return (
    <>
      <PageHeader title="News sources" />
      <NewsSourcesClient
        initialSources={(sources ?? []) as unknown as NewsSourceRecord[]}
        stats={stats}
        inboundDomain={RESEARCH_INBOUND_DOMAIN}
      />
    </>
  );
}
