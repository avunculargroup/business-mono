import { createTool } from '@mastra/core';
import { z } from 'zod';
import { vectorSearch, graphTraverse, fulltextSearch } from '@platform/db';
import { YoutubeTranscript } from 'youtube-transcript';

/** Extract a YouTube video ID from various URL formats or a raw 11-char ID. */
function extractVideoId(input: string): string | null {
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

export const webFetch = createTool({
  id: 'web_fetch',
  description: 'Fetch and extract content from a URL',
  inputSchema: z.object({
    url: z.string().describe('URL to fetch'),
  }),
  execute: async ({ context }) => {
    const response = await fetch(context.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PlatformArchivist/1.0)' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${context.url}: ${response.statusText}`);
    }

    const html = await response.text();
    // Strip HTML tags for raw content
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? context.url;

    return { url: context.url, title, rawContent: text.slice(0, 50000) };
  },
});

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

export const vectorSearchTool = createTool({
  id: 'vector_search',
  description: 'Search the knowledge base by semantic similarity',
  inputSchema: z.object({
    queryEmbedding: z.array(z.number()).describe('Query embedding vector'),
    matchThreshold: z.number().default(0.7).describe('Minimum similarity score'),
    matchCount: z.number().default(10).describe('Max results to return'),
  }),
  execute: async ({ context }) => {
    const results = await vectorSearch(context.queryEmbedding, {
      matchThreshold: context.matchThreshold,
      matchCount: context.matchCount,
    });
    return { results };
  },
});

export const graphTraverseTool = createTool({
  id: 'graph_traverse',
  description: 'Traverse the knowledge graph starting from an item',
  inputSchema: z.object({
    startItemId: z.string().describe('ID of the starting knowledge item'),
    relationshipFilter: z.string().optional().describe('Filter by relationship type'),
    maxDepth: z.number().default(3).describe('Maximum traversal depth'),
  }),
  execute: async ({ context }) => {
    const results = await graphTraverse(context.startItemId, {
      relationshipFilter: context.relationshipFilter,
      maxDepth: context.maxDepth,
    });
    return { results };
  },
});

export const fulltextSearchTool = createTool({
  id: 'fulltext_search',
  description: 'Search the knowledge base using full-text search',
  inputSchema: z.object({
    query: z.string().describe('Search query (supports websearch syntax)'),
    limit: z.number().default(10).describe('Max results'),
  }),
  execute: async ({ context }) => {
    const results = await fulltextSearch(context.query, { limit: context.limit });
    return { results };
  },
});
