'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { youtubeThumbnail, youtubeEmbedUrl } from '@/lib/podcasts';
import styles from './media.module.css';

interface Props {
  videoId: string;
  title?: string;
  // Deep-link start (seconds). Changing it while playing remounts the iframe so
  // a transcript-timestamp click jumps the already-open player.
  startSeconds?: number | null;
}

// Click-to-play facade: render the poster + a gold play button, only swapping in
// the real privacy-friendly iframe on click. Keeps the dashboard from mounting a
// dozen heavy YouTube players at once.
export function YouTubeFacade({ videoId, title, startSeconds }: Props) {
  const [playing, setPlaying] = useState(false);

  // A transcript-timestamp deep-link sets a new startSeconds; reveal the player
  // (it would otherwise stay a facade) and let the keyed iframe jump.
  const prevStart = useRef(startSeconds);
  useEffect(() => {
    if (startSeconds != null && startSeconds !== prevStart.current) setPlaying(true);
    prevStart.current = startSeconds;
  }, [startSeconds]);

  if (playing) {
    return (
      <div className={styles.frame}>
        <iframe
          key={startSeconds ?? 0}
          className={styles.iframe}
          src={youtubeEmbedUrl(videoId, startSeconds)}
          title={title ?? 'Episode video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.facade}
      onClick={() => setPlaying(true)}
      aria-label={title ? `Play ${title}` : 'Play video'}
      style={{ backgroundImage: `url(${youtubeThumbnail(videoId)})` }}
    >
      <span className={styles.playButton}>
        <Play size={22} strokeWidth={1.5} fill="currentColor" />
      </span>
    </button>
  );
}
