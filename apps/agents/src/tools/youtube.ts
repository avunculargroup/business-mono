import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { decodeEntities } from '../lib/transcripts/parsers.js';

/** Extract a YouTube video ID from various URL formats or a raw 11-char ID. */
export function extractVideoId(input: string): string | null {
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

/** Format seconds into MM:SS or HH:MM:SS. */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Scrape title and channel from the YouTube watch page. */
async function fetchVideoMetadata(
  videoId: string,
): Promise<{ title: string; channel: string }> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { title: `YouTube video ${videoId}`, channel: 'Unknown' };

    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(' - YouTube', '').trim();
    const channel = html.match(/"ownerChannelName":"([^"]+)"/)?.[1];
    return {
      title: title ? decodeEntities(title) : `YouTube video ${videoId}`,
      channel: channel ? decodeEntities(channel) : 'Unknown',
    };
  } catch {
    return { title: `YouTube video ${videoId}`, channel: 'Unknown' };
  }
}

/** Translate youtube-transcript's library-prefixed errors into actionable ones. */
function toFriendlyError(err: unknown, videoId: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/disabled|no transcripts are available/i.test(msg)) {
    return new Error(
      `No transcript available for video ${videoId}. The video may not have captions enabled.`,
    );
  }
  if (/no longer available|unavailable/i.test(msg)) {
    return new Error(`YouTube video ${videoId} is unavailable.`);
  }
  if (/too many requests|captcha/i.test(msg)) {
    return new Error(
      `YouTube is rate-limiting transcript requests from this server. Try again later (video ${videoId}).`,
    );
  }
  return new Error(`Failed to fetch YouTube transcript for ${videoId}: ${msg}`);
}

interface RawSegment {
  offset: number;
  duration: number;
  text: string;
}

/**
 * Fetch the caption track, preferring `lang` when given but falling back to the
 * default track so a missing translation never fails the whole fetch. Returns
 * the language actually used (null when unknown/fallback).
 */
async function fetchTranscriptTrack(
  videoId: string,
  lang?: string,
): Promise<{ raw: RawSegment[]; language: string | null }> {
  const { YoutubeTranscript } = await import('youtube-transcript');
  if (lang) {
    try {
      return { raw: await YoutubeTranscript.fetchTranscript(videoId, { lang }), language: lang };
    } catch {
      // Requested language track missing — fall through to the default track.
    }
  }
  try {
    return { raw: await YoutubeTranscript.fetchTranscript(videoId), language: null };
  } catch (err) {
    throw toFriendlyError(err, videoId);
  }
}

export interface YoutubeSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeSegments {
  videoId: string;
  title: string;
  channel: string;
  /** Language of the caption track, when known (the requested `lang` matched). */
  language: string | null;
  segments: YoutubeSegment[];
}

/**
 * Fetch a YouTube transcript as structured, timestamped segments (start/end in
 * seconds) rather than the pre-joined string `youtubeTranscript` returns. Used
 * by the podcast transcript waterfall, where per-segment timestamps must survive
 * into transcript_segments for deep-links. Throws when no captions exist.
 */
export async function fetchYoutubeSegments(
  videoUrl: string,
  lang?: string,
): Promise<YoutubeSegments> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error(
      'Could not extract YouTube video ID. Provide a valid YouTube URL or 11-character video ID.',
    );
  }

  const [{ raw, language }, metadata] = await Promise.all([
    fetchTranscriptTrack(videoId, lang),
    fetchVideoMetadata(videoId),
  ]);

  if (!raw.length) {
    throw new Error(`No transcript available for video ${videoId}. The video may not have captions enabled.`);
  }

  // offset/duration are ms (srv3 format) or seconds (classic format). Heuristic:
  // a >10hr offset (36000s) or any single caption lasting >100s is unrealistic
  // in seconds, so either signals milliseconds. The duration check catches short
  // videos (e.g. Shorts) whose final offset stays under 36000 even in ms.
  const lastOffset = raw[raw.length - 1].offset;
  const isMs = lastOffset > 36000 || raw.some((seg) => seg.duration > 100);
  const toSeconds = (val: number) => (isMs ? val / 1000 : val);

  const segments: YoutubeSegment[] = raw.map((seg) => ({
    start: toSeconds(seg.offset),
    end: toSeconds(seg.offset + seg.duration),
    text: decodeEntities(seg.text),
  }));

  return { videoId, title: metadata.title, channel: metadata.channel, language, segments };
}

const TRANSCRIPT_CHAR_CAP = 50_000;

export const youtubeTranscript = createTool({
  id: 'youtube_transcript',
  description:
    'Fetch the transcript and metadata for a YouTube video. Returns timestamped transcript text, video title, channel name, duration, and segment count.',
  inputSchema: z.object({
    videoUrl: z.string().describe('YouTube video URL or video ID'),
    lang: z
      .string()
      .optional()
      .describe('Preferred caption language code (e.g. "en"); falls back to the default track'),
  }),
  execute: async (context) => {
    const { videoId, title, channel, segments } = await fetchYoutubeSegments(
      context.videoUrl,
      context.lang,
    );

    const transcript = segments
      .map((seg) => `[${formatTimestamp(seg.start)}] ${seg.text}`)
      .join('\n');
    const duration = formatTimestamp(segments[segments.length - 1].end);
    const truncated = transcript.length > TRANSCRIPT_CHAR_CAP;

    return {
      videoId,
      title,
      channel,
      duration,
      segmentCount: segments.length,
      transcript: truncated ? transcript.slice(0, TRANSCRIPT_CHAR_CAP) : transcript,
      truncated,
    };
  },
});
