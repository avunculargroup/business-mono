import { createTool } from '@mastra/core';
import { z } from 'zod';
import { YoutubeTranscript } from 'youtube-transcript';

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
    });
    if (!response.ok) return { title: `YouTube video ${videoId}`, channel: 'Unknown' };

    const html = await response.text();
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(' - YouTube', '').trim() ??
      `YouTube video ${videoId}`;
    const channel = html.match(/"ownerChannelName":"([^"]+)"/)?.[1] ?? 'Unknown';
    return { title, channel };
  } catch {
    return { title: `YouTube video ${videoId}`, channel: 'Unknown' };
  }
}

export const youtubeTranscript = createTool({
  id: 'youtube_transcript',
  description:
    'Fetch the transcript and metadata for a YouTube video. Returns timestamped transcript text, video title, channel name, duration, and segment count.',
  inputSchema: z.object({
    videoUrl: z.string().describe('YouTube video URL or video ID'),
  }),
  execute: async ({ context }) => {
    const videoId = extractVideoId(context.videoUrl);
    if (!videoId) {
      throw new Error(
        'Could not extract YouTube video ID. Provide a valid YouTube URL or 11-character video ID.',
      );
    }

    const [segments, metadata] = await Promise.all([
      YoutubeTranscript.fetchTranscript(videoId),
      fetchVideoMetadata(videoId),
    ]);

    if (!segments.length) {
      throw new Error(`No transcript available for video ${videoId}. The video may not have captions enabled.`);
    }

    // The package returns offset in ms (srv3 format) or seconds (classic format).
    // Heuristic: if the last offset > 36000, it's milliseconds (36000s = 10hrs is unrealistic).
    const lastOffset = segments[segments.length - 1].offset;
    const isMs = lastOffset > 36000;
    const toSeconds = (val: number) => (isMs ? val / 1000 : val);

    const transcript = segments
      .map((seg) => `[${formatTimestamp(toSeconds(seg.offset))}] ${seg.text}`)
      .join('\n');

    const lastSeg = segments[segments.length - 1];
    const totalSeconds = toSeconds(lastSeg.offset + lastSeg.duration);
    const duration = formatTimestamp(totalSeconds);

    return {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      duration,
      segmentCount: segments.length,
      transcript: transcript.slice(0, 50_000),
    };
  },
});
