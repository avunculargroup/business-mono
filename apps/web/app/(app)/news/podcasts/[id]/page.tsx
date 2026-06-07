import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { EpisodeDetail } from './EpisodeDetail';
import type { PodcastEpisode, TranscriptSegment } from '@platform/shared';

export const dynamic = 'force-dynamic';

export default async function EpisodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: episode } = await supabase.from('podcast_episodes').select('*').eq('id', id).single();
  if (!episode) notFound();

  const ep = episode as unknown as PodcastEpisode;

  const [{ data: segments }, sourceName] = await Promise.all([
    supabase
      .from('transcript_segments')
      .select('id, episode_id, segment_index, start_seconds, end_seconds, speaker, content, token_count, created_at')
      .eq('episode_id', id)
      .order('segment_index', { ascending: true }),
    ep.source_id
      ? supabase
          .from('news_sources')
          .select('name')
          .eq('id', ep.source_id)
          .single()
          .then((r) => (r.data as { name: string } | null)?.name ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="Episode" />
      <EpisodeDetail
        episode={ep}
        segments={(segments ?? []) as unknown as TranscriptSegment[]}
        sourceName={sourceName}
      />
    </>
  );
}
