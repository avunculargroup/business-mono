import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { NewsSourcesClient, type SourceStats } from './NewsSourcesClient';
import { ReportWatchHealth } from './ReportWatchHealth';
import { RESEARCH_INBOUND_DOMAIN } from '@/lib/news/emailSource';
import type { NewsSourceRecord, ReportWatchHealthRow } from '@platform/shared';

export default async function NewsSourcesPage() {
  const supabase = await createClient();

  const [{ data: sources }, { data: episodes }, { data: health }] = await Promise.all([
    supabase.from('news_sources').select('*').order('name', { ascending: true }),
    // Per-source episode + transcript-coverage counts for the feed list. Small
    // data set (pre-revenue), so aggregate in JS rather than via an RPC.
    supabase.from('podcast_episodes').select('source_id, transcript_status'),
    // The view already sorts worst-first and filters to report_watch sources.
    // It returns nothing until the first report watch is configured, and the
    // panel renders nothing on an empty list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('v_report_watch_health' as any).select('*') as any),
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
      <ReportWatchHealth rows={(health ?? []) as unknown as ReportWatchHealthRow[]} />
      <NewsSourcesClient
        initialSources={(sources ?? []) as unknown as NewsSourceRecord[]}
        stats={stats}
        inboundDomain={RESEARCH_INBOUND_DOMAIN}
      />
    </>
  );
}
