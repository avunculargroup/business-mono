import Link from 'next/link';
import { Search, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PodcastDashboard, type DashboardEpisode, type FeedHealth } from './PodcastDashboard';
import styles from './podcasts.module.css';

export const dynamic = 'force-dynamic';

export default async function PodcastsPage() {
  const supabase = await createClient();

  const [{ data: statusRows }, { data: meta }, { data: sources }] = await Promise.all([
    // The spec's monitoring surface: one row per episode with source + status.
    supabase.from('v_podcast_ingestion_status').select('*'),
    // Ingest time + the fields the view omits (duration, topic tags), joined by id.
    supabase.from('podcast_episodes').select('id, created_at, duration_seconds, topic_tags'),
    // Per-feed health: podcast/youtube sources only.
    supabase
      .from('news_sources')
      .select('name, source_type, transcribe_with_deepgram, last_scanned_at')
      .in('source_type', ['podcast', 'youtube'])
      .order('name', { ascending: true }),
  ]);

  const metaById = new Map(
    (meta ?? []).map((m) => {
      const r = m as { id: string; created_at: string; duration_seconds: number | null; topic_tags: string[] };
      return [r.id, r];
    }),
  );

  const episodes: DashboardEpisode[] = (statusRows ?? [])
    .filter((r) => (r as { id: string | null }).id)
    .map((r) => {
      const row = r as Record<string, unknown>;
      const id = row['id'] as string;
      const m = metaById.get(id);
      return {
        id,
        title: (row['title'] as string) ?? 'Untitled episode',
        published_at: (row['published_at'] as string | null) ?? null,
        transcript_status: (row['transcript_status'] as DashboardEpisode['transcript_status']) ?? 'pending',
        transcript_source: (row['transcript_source'] as DashboardEpisode['transcript_source']) ?? null,
        has_timestamps: Boolean(row['has_timestamps']),
        embedded_at: (row['embedded_at'] as string | null) ?? null,
        transcript_error: (row['transcript_error'] as string | null) ?? null,
        youtube_url: (row['youtube_url'] as string | null) ?? null,
        audio_url: (row['audio_url'] as string | null) ?? null,
        source_name: (row['source_name'] as string | null) ?? null,
        created_at: m?.created_at ?? null,
        duration_seconds: m?.duration_seconds ?? null,
        topic_tags: m?.topic_tags ?? [],
      };
    });

  // Per-feed health, aggregated from the view by source name.
  const bySource = new Map<string, { total: number; available: number }>();
  for (const ep of episodes) {
    if (!ep.source_name) continue;
    const row = bySource.get(ep.source_name) ?? { total: 0, available: 0 };
    row.total += 1;
    if (ep.transcript_status === 'available') row.available += 1;
    bySource.set(ep.source_name, row);
  }
  const feeds: FeedHealth[] = (sources ?? []).map((s) => {
    const src = s as {
      name: string;
      source_type: string;
      transcribe_with_deepgram: boolean | null;
      last_scanned_at: string | null;
    };
    const counts = bySource.get(src.name) ?? { total: 0, available: 0 };
    return {
      name: src.name,
      source_type: src.source_type,
      transcribe_with_deepgram: Boolean(src.transcribe_with_deepgram),
      last_scanned_at: src.last_scanned_at,
      episodes: counts.total,
      coverage: counts.total > 0 ? Math.round((counts.available / counts.total) * 100) : 0,
    };
  });

  const needsDecision = episodes.filter(
    (e) => e.transcript_status === 'failed' || e.transcript_status === 'skipped',
  ).length;

  return (
    <>
      <PageHeader title="Podcast ingestion">
        <Link
          href="/news/podcasts/decisions"
          className={styles.headerLink}
          aria-label={`Needs a decision${needsDecision > 0 ? ` (${needsDecision})` : ''}`}
        >
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span className={styles.headerLinkLabel}>Needs a decision</span>
          {needsDecision > 0 && <span className={styles.headerBadge}>{needsDecision}</span>}
        </Link>
        <Link href="/news/podcasts/search" className={styles.headerLink} aria-label="Search transcripts">
          <Search size={16} strokeWidth={1.5} />
          <span className={styles.headerLinkLabel}>Search transcripts</span>
        </Link>
      </PageHeader>
      <PodcastDashboard episodes={episodes} feeds={feeds} />
    </>
  );
}
