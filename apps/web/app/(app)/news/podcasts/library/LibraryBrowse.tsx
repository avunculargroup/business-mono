'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Library } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTimestamp } from '@/lib/podcasts';
import { formatDate } from '@/lib/utils';
import { NEWS_CATEGORY_LABELS, type EpisodeLibraryCard, type NewsCategory } from '@platform/shared';
import styles from './library.module.css';

type SortKey = 'relevance' | 'recent';

interface Props {
  episodes: EpisodeLibraryCard[];
}

// Relevance desc with nulls last; used as the default lens ("most relevant to
// treasury first" rather than "most recently published").
function byRelevance(a: EpisodeLibraryCard, b: EpisodeLibraryCard): number {
  const ra = a.relevance_score ?? -1;
  const rb = b.relevance_score ?? -1;
  return rb - ra;
}

function byRecent(a: EpisodeLibraryCard, b: EpisodeLibraryCard): number {
  return (b.published_at ?? '').localeCompare(a.published_at ?? '');
}

export function LibraryBrowse({ episodes }: Props) {
  const [category, setCategory] = useState<NewsCategory | 'all'>('all');
  const [source, setSource] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [hasTakeaways, setHasTakeaways] = useState(false);
  const [query, setQuery] = useState('');

  // Filter options are drawn from what's actually present, so empty options
  // never appear.
  const categories = useMemo(
    () => [...new Set(episodes.map((e) => e.category).filter((c): c is NewsCategory => c != null))].sort(),
    [episodes],
  );
  const sources = useMemo(
    () => [...new Set(episodes.map((e) => e.source_name).filter((s): s is string => s != null))].sort(),
    [episodes],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return episodes
      .filter((e) => category === 'all' || e.category === category)
      .filter((e) => source === 'all' || e.source_name === source)
      .filter((e) => !hasTakeaways || e.key_takeaways.length > 0)
      .filter((e) => q === '' || e.title.toLowerCase().includes(q))
      .sort(sort === 'relevance' ? byRelevance : byRecent);
  }, [episodes, category, source, hasTakeaways, query, sort]);

  if (episodes.length === 0) {
    return (
      <div className={styles.container}>
        <EmptyState
          icon={Library}
          title="The library is empty"
          description="Episodes appear here once their brief has been approved. Generate and approve a brief from an episode to publish it to the library."
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title"
          aria-label="Filter by title"
        />
        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value as NewsCategory | 'all')} aria-label="Category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{NEWS_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select className={styles.select} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          <option value="relevance">Most relevant</option>
          <option value="recent">Most recent</option>
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" checked={hasTakeaways} onChange={(e) => setHasTakeaways(e.target.checked)} />
          Has takeaways
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Library} title="No episodes match" description="Try clearing a filter." />
      ) : (
        <ul className={styles.grid}>
          {shown.map((e) => (
            <li key={e.id} className={styles.card}>
              <Link href={`/news/podcasts/${e.slug}`} className={styles.cardLink}>
                <div className={styles.artwork}>
                  {e.image_url ? (
                    <img src={e.image_url} alt="" className={styles.artworkImg} />
                  ) : (
                    <div className={styles.artworkPlaceholder} aria-hidden />
                  )}
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardMetaTop}>
                    {e.category && <span className={styles.categoryChip}>{NEWS_CATEGORY_LABELS[e.category]}</span>}
                    {e.relevance_score != null && (
                      <span className={styles.relevance}>{e.relevance_score.toFixed(2)}</span>
                    )}
                  </div>
                  <h3 className={styles.cardTitle}>{e.title}</h3>
                  <div className={styles.cardMeta}>
                    {e.source_name && <span>{e.source_name}</span>}
                    {e.duration_seconds != null && <span>{formatTimestamp(e.duration_seconds)}</span>}
                    {e.published_at && <span>{formatDate(e.published_at)}</span>}
                  </div>
                  {e.episode_summary && <p className={styles.cardSummary}>{e.episode_summary}</p>}
                  <div className={styles.cardFooter}>
                    {e.key_takeaways.length > 0 && <span>{e.key_takeaways.length} takeaways</span>}
                    {e.chapters.length > 0 && <span>{e.chapters.length} chapters</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
