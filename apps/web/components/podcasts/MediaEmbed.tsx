'use client';

import { YouTubeFacade } from './YouTubeFacade';
import { extractVideoId } from '@/lib/podcasts';
import styles from './media.module.css';

interface Props {
  youtubeUrl?: string | null;
  audioUrl?: string | null;
  title?: string;
}

// Inline media for an episode: a click-to-play video facade where a YouTube
// link exists, otherwise a native audio element. Renders nothing when neither
// is present.
export function MediaEmbed({ youtubeUrl, audioUrl, title }: Props) {
  const videoId = extractVideoId(youtubeUrl);
  if (videoId) return <YouTubeFacade videoId={videoId} title={title} />;
  if (audioUrl) {
    return <audio className={styles.audio} controls preload="none" src={audioUrl} />;
  }
  return null;
}
