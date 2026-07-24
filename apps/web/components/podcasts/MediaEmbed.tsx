'use client';

import { useRef } from 'react';
import { YouTubeFacade } from './YouTubeFacade';
import { AudioPlayer } from './AudioPlayer';
import { extractVideoId } from '@/lib/podcasts';

interface Props {
  youtubeUrl?: string | null;
  audioUrl?: string | null;
  title?: string;
  // Feed-supplied duration, shown until the audio element reports its own metadata.
  durationSeconds?: number | null;
}

// Inline media for an episode: a click-to-play video facade where a YouTube
// link exists, otherwise the branded audio player. Renders nothing when neither
// is present.
export function MediaEmbed({ youtubeUrl, audioUrl, title, durationSeconds }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoId = extractVideoId(youtubeUrl);
  if (videoId) return <YouTubeFacade videoId={videoId} title={title} />;
  if (audioUrl) {
    return <AudioPlayer src={audioUrl} audioRef={audioRef} durationFallback={durationSeconds} />;
  }
  return null;
}
