// Client-safe podcast/transcript helpers for the web app. The video-ID parser
// mirrors apps/agents/src/tools/youtube.ts (extractVideoId) — kept in sync by
// hand since the two apps don't share a runtime package.

import type { TranscriptStatus, TranscriptSource } from '@platform/shared';

/** Extract a YouTube video ID from various URL formats or a raw 11-char ID. */
export function extractVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Poster thumbnail for the click-to-play facade (no player loaded). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Privacy-friendly embed URL. autoplay once the user opts into the facade;
 * startSeconds deep-links a transcript moment into the player.
 */
export function youtubeEmbedUrl(videoId: string, startSeconds?: number | null): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0' });
  if (startSeconds != null && startSeconds > 0) params.set('start', String(Math.floor(startSeconds)));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Format seconds into M:SS or H:MM:SS — for transcript timestamps + durations. */
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Status + provenance presentation (spec §"Web App" token mapping) ──────────

type ChipColor = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

export const TRANSCRIPT_STATUS_LABELS: Record<TranscriptStatus, string> = {
  pending: 'Pending',
  resolving: 'Resolving',
  transcribing: 'Transcribing',
  available: 'Available',
  failed: 'Failed',
  skipped: 'Skipped',
};

// available → success; transcribing → warning; pending/resolving → secondary
// (neutral); skipped → muted (neutral); failed → destructive.
export const TRANSCRIPT_STATUS_COLORS: Record<TranscriptStatus, ChipColor> = {
  pending: 'neutral',
  resolving: 'neutral',
  transcribing: 'warning',
  available: 'success',
  failed: 'destructive',
  skipped: 'neutral',
};

export const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  feed_tag: 'Publisher feed',
  youtube: 'YouTube',
  deepgram: 'Deepgram',
  manual: 'Manual',
};
