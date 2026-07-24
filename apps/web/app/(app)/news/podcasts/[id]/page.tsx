import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { EpisodeDetail } from './EpisodeDetail';
import { idColumn } from '@/lib/utils';
import type { EpisodeConnections, PodcastEpisode, TranscriptSegment } from '@platform/shared';

export const dynamic = 'force-dynamic';

export default async function EpisodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  // Deep-link from transcript search: ?t=<seconds> seeks the media on arrival.
  const { t } = await searchParams;
  const initialSeek = t != null && /^\d+$/.test(t) ? Number(t) : null;
  const supabase = await createClient();

  const { data: episode } = await supabase.from('podcast_episodes').select('*').eq(idColumn(id), id).single();
  if (!episode) notFound();

  const ep = episode as unknown as PodcastEpisode;

  // Cross-links (C3): related news + episodes share ≥1 topic tag; companies come
  // from the deterministic gazetteer stored on the episode. Tag-based queries are
  // skipped entirely when the episode carries no tags (overlaps([]) matches
  // nothing anyway).
  const tags = ep.topic_tags ?? [];
  const emptyRows = Promise.resolve({ data: [] as unknown[] });

  const [{ data: segments }, sourceName, { data: relatedNews }, { data: relatedEpisodes }] = await Promise.all([
    supabase
      .from('transcript_segments')
      .select('id, episode_id, segment_index, start_seconds, end_seconds, speaker, content, token_count, created_at')
      .eq('episode_id', ep.id)
      .order('segment_index', { ascending: true }),
    ep.source_id
      ? supabase
          .from('news_sources')
          .select('name')
          .eq('id', ep.source_id)
          .single()
          .then((r) => (r.data as { name: string } | null)?.name ?? null)
      : Promise.resolve(null),
    tags.length
      ? supabase
          .from('news_items')
          .select('id, title, url, published_at, category')
          .overlaps('topic_tags', tags)
          .order('published_at', { ascending: false })
          .limit(5)
      : emptyRows,
    tags.length
      ? supabase
          .from('podcast_episodes')
          .select('id, slug, title, published_at')
          .overlaps('topic_tags', tags)
          .neq('id', ep.id)
          .order('published_at', { ascending: false })
          .limit(6)
      : emptyRows,
  ]);

  const connections: EpisodeConnections = {
    companies: ep.mentioned_entities?.companies ?? [],
    relatedNews: (relatedNews ?? []) as EpisodeConnections['relatedNews'],
    relatedEpisodes: (relatedEpisodes ?? []) as EpisodeConnections['relatedEpisodes'],
  };

  return (
    <>
      <PageHeader title="Episode" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <EpisodeDetail
        episode={ep}
        segments={(segments ?? []) as unknown as TranscriptSegment[]}
        sourceName={sourceName}
        initialSeek={initialSeek}
        connections={connections}
      />
    </>
  );
}
