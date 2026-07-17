import Link from 'next/link';
import { Podcast, Youtube } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { formatRelativeDate } from '@/lib/utils';
import { DeepgramToggle } from './DeepgramToggle';
import styles from './feeds.module.css';

export const dynamic = 'force-dynamic';

interface FeedCard {
  id: string;
  name: string;
  source_type: string;
  transcribe_with_deepgram: boolean;
  last_scanned_at: string | null;
  image_url: string | null;
  episodes: number;
  coverage: number;
}

export default async function PodcastFeedsPage() {
  const supabase = await createClient();

  const [{ data: sources }, { data: episodes }] = await Promise.all([
    supabase
      .from('news_sources')
      .select('id, name, source_type, transcribe_with_deepgram, last_scanned_at, image_url')
      .in('source_type', ['podcast', 'youtube'])
      .order('name', { ascending: true }),
    // Aggregated per source below: episode count, transcript coverage, and a
    // fallback artwork (the most recently published episode's image_url) for
    // sources without stored channel art — youtube sources have no scan path
    // that could populate news_sources.image_url.
    supabase.from('podcast_episodes').select('source_id, transcript_status, image_url, published_at'),
  ]);

  const bySource = new Map<string, { total: number; available: number; image_url: string | null; imageAt: number }>();
  for (const e of episodes ?? []) {
    const row = e as {
      source_id: string | null;
      transcript_status: string;
      image_url: string | null;
      published_at: string | null;
    };
    if (!row.source_id) continue;
    const agg = bySource.get(row.source_id) ?? { total: 0, available: 0, image_url: null, imageAt: -1 };
    agg.total += 1;
    if (row.transcript_status === 'available') agg.available += 1;
    if (row.image_url) {
      const at = row.published_at ? new Date(row.published_at).getTime() : 0;
      if (at > agg.imageAt) {
        agg.image_url = row.image_url;
        agg.imageAt = at;
      }
    }
    bySource.set(row.source_id, agg);
  }

  const feeds: FeedCard[] = (sources ?? []).map((s) => {
    const src = s as {
      id: string;
      name: string;
      source_type: string;
      transcribe_with_deepgram: boolean | null;
      last_scanned_at: string | null;
      image_url: string | null;
    };
    const agg = bySource.get(src.id) ?? { total: 0, available: 0, image_url: null, imageAt: -1 };
    return {
      id: src.id,
      name: src.name,
      source_type: src.source_type,
      transcribe_with_deepgram: Boolean(src.transcribe_with_deepgram),
      last_scanned_at: src.last_scanned_at,
      image_url: src.image_url ?? agg.image_url,
      episodes: agg.total,
      coverage: agg.total > 0 ? Math.round((agg.available / agg.total) * 100) : 0,
    };
  });

  return (
    <>
      <PageHeader title="Podcasts" backHref="/news/podcasts" backLabel="Podcast ingestion" />
      <div className={styles.container}>
        {feeds.length === 0 ? (
          <p className={styles.empty}>
            No podcast or YouTube sources yet. Add one from the{' '}
            <Link href="/news/sources" className={styles.emptyLink}>
              news sources page
            </Link>
            .
          </p>
        ) : (
          <div className={styles.grid}>
            {feeds.map((f) => (
              <div key={f.id} className={styles.card}>
                {f.image_url ? (
                  <img className={styles.artwork} src={f.image_url} alt="" />
                ) : (
                  <div className={styles.artworkPlaceholder}>
                    {f.source_type === 'youtube' ? (
                      <Youtube size={24} strokeWidth={1.5} />
                    ) : (
                      <Podcast size={24} strokeWidth={1.5} />
                    )}
                  </div>
                )}
                <div className={styles.cardBody}>
                  <div className={styles.cardHead}>
                    <span className={styles.name}>{f.name}</span>
                    {f.source_type === 'podcast' && (
                      <DeepgramToggle sourceId={f.id} enabled={f.transcribe_with_deepgram} />
                    )}
                  </div>
                  <div className={styles.stats}>
                    <span className={styles.mono}>{f.episodes}</span> episodes
                    <span className={styles.divider}>·</span>
                    <span className={styles.mono}>{f.coverage}%</span> transcribed
                  </div>
                  <div className={styles.run}>
                    Last run {f.last_scanned_at ? formatRelativeDate(f.last_scanned_at) : 'never'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
