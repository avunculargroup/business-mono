'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { searchTranscripts, type TranscriptSearchHit } from '@/app/actions/podcastSearch';
import { formatTimestamp } from '@/lib/podcasts';
import { formatDate } from '@/lib/utils';
import styles from './search.module.css';

const MIN_QUERY_LENGTH = 3;

interface SearchState {
  hits: TranscriptSearchHit[];
  error: string | null;
  query: string;
}

// Deep-link to the episode page at the matched moment. ?t= is honoured by the
// episode page's media (seeks the audio / opens the video at that second); with
// no timestamp it just opens the episode.
function episodeLink(hit: TranscriptSearchHit): string {
  const base = `/news/podcasts/${hit.episode_id}`;
  return hit.start_seconds != null ? `${base}?t=${Math.floor(hit.start_seconds)}` : base;
}

export function TranscriptSearch() {
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SearchState | null>(null);

  const runSearch = () => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    startTransition(async () => {
      const res = await searchTranscripts(q);
      setState(
        'error' in res
          ? { hits: [], error: res.error, query: q }
          : { hits: res.results, error: null, query: q },
      );
    });
  };

  return (
    <div className={styles.container}>
      <form
        role="search"
        className={styles.searchForm}
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className={styles.searchBox}>
          <Search size={18} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask the library — e.g. how are companies accounting for bitcoin?"
            aria-label="Search transcripts"
          />
        </div>
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={query.trim().length < MIN_QUERY_LENGTH}>
          Search
        </Button>
      </form>
      <p className={styles.hint}>Searches spoken words across every ingested episode transcript by meaning.</p>

      {state === null ? (
        <EmptyState
          icon={Search}
          title="Search the transcript library"
          description="Type a treasury question and find the moments across every episode where it was discussed, with a link straight to that point in the audio or video."
        />
      ) : state.error ? (
        <p className={styles.stateNote}>{state.error}</p>
      ) : state.hits.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching passages"
          description={`Nothing in the transcript library matched “${state.query}”. Try different words, or check that the relevant episodes are transcribed and in the research index.`}
        />
      ) : (
        <ul className={styles.results}>
          {state.hits.map((hit) => (
            <li key={hit.segment_id} className={styles.result}>
              <div className={styles.resultHead}>
                <Link href={`/news/podcasts/${hit.episode_id}`} className={styles.episodeTitle}>
                  {hit.episode_title}
                </Link>
                <span className={styles.similarity}>{Math.round(hit.similarity * 100)}% match</span>
              </div>
              <div className={styles.resultMeta}>
                {hit.source_name && <span>{hit.source_name}</span>}
                {hit.published_at && <span>{formatDate(hit.published_at)}</span>}
              </div>
              <p className={styles.passage}>
                {hit.speaker && <span className={styles.speaker}>{hit.speaker}: </span>}
                {hit.content}
              </p>
              <Link href={episodeLink(hit)} className={styles.playLink}>
                <Play size={14} strokeWidth={1.5} />
                {hit.start_seconds != null ? `Play at ${formatTimestamp(hit.start_seconds)}` : 'Open episode'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
