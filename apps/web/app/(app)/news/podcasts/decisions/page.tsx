import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { DecisionsList, type DecisionEpisode } from './DecisionsList';
import type { TranscriptStatus } from '@platform/shared';

export const dynamic = 'force-dynamic';

export default async function PodcastDecisionsPage() {
  const supabase = await createClient();

  // Only the stalled episodes — failed or skipped — that need a human decision.
  const { data: rows } = await supabase
    .from('v_podcast_ingestion_status')
    .select('id, title, transcript_status, transcript_error, source_name')
    .in('transcript_status', ['failed', 'skipped']);

  const episodes: DecisionEpisode[] = (rows ?? [])
    .filter((r) => (r as { id: string | null }).id)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row['id'] as string,
        title: (row['title'] as string) ?? 'Untitled episode',
        transcript_status: (row['transcript_status'] as TranscriptStatus) ?? 'pending',
        transcript_error: (row['transcript_error'] as string | null) ?? null,
        source_name: (row['source_name'] as string | null) ?? null,
      };
    });

  return (
    <>
      <PageHeader title="Needs a decision" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <DecisionsList episodes={episodes} />
    </>
  );
}
