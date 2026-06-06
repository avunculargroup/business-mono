import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { vectorSearch, graphTraverse, fulltextSearch } from '@platform/db';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';
import { resolveTranscript } from '../../lib/transcripts/resolveTranscript.js';
import {
  insertEpisode,
  updateEpisode,
  storeAvailableTranscript,
} from '../../lib/transcripts/store.js';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

export const webFetch = createTool({
  id: 'web_fetch',
  description: 'Fetch and extract content from a URL',
  inputSchema: z.object({
    url: z.string().describe('URL to fetch'),
  }),
  execute: async (context) => {
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

export const ingestEpisode = createTool({
  id: 'ingest_episode',
  description:
    'Ingest a one-off podcast episode or interview from an audio or YouTube URL and resolve its transcript. Use for spoken content with no clean feed — Simon forwards these with a reason. Creates a durable episode row and embeds the transcript so Rex can retrieve it. Deepgram transcription is allowed here (it is an explicit human decision to save this). Returns the episode id and resolution status.',
  inputSchema: z.object({
    audio_url: z.string().optional().describe('Direct audio file URL (the input to Deepgram)'),
    youtube_url: z.string().optional().describe('YouTube video URL, if the episode is on YouTube'),
    title: z.string().optional().describe('Episode title, if known'),
    why: z.string().describe('Why this is worth saving — stored as the curator note and surfaced in retrieval'),
  }),
  execute: async (context) => {
    const url = context.youtube_url ?? context.audio_url;
    if (!url) throw new Error('Provide an audio_url or youtube_url to ingest.');

    // guid = hash of the source URL — the dedupe key for ad-hoc episodes.
    const guid = createHash('sha256').update(url).digest('hex');

    const episodeId = await insertEpisode({
      source_id: null,
      guid,
      title: context.title ?? url,
      audio_url: context.audio_url ?? null,
      youtube_url: context.youtube_url ?? null,
      ingestion_origin: 'brief',
      curator_note: context.why,
      transcript_status: 'resolving',
    });

    // Same waterfall as the daily batch; feed-tag stage is skipped (no tags).
    // Briefs allow Deepgram — the human already decided this is worth paying for.
    const outcome = await resolveTranscript(
      {
        youtube_url: context.youtube_url ?? null,
        audio_url: context.audio_url ?? null,
        published_at: null,
        transcriptTags: [],
      },
      { transcribe_with_deepgram: true, preferred_transcript_lang: 'en', max_episode_age_days: null },
    );

    if (outcome.kind === 'available') {
      const { segments } = await storeAvailableTranscript(episodeId, outcome);
      return { episode_id: episodeId, status: 'available', transcript_source: outcome.source, segments };
    }
    if (outcome.kind === 'transcribing') {
      await updateEpisode(episodeId, {
        transcript_status: 'transcribing',
        deepgram_request_id: outcome.deepgramRequestId,
      });
      return {
        episode_id: episodeId,
        status: 'transcribing',
        note: 'Submitted to Deepgram; the transcript will resolve when the callback fires.',
      };
    }
    if (outcome.kind === 'failed') {
      await updateEpisode(episodeId, { transcript_status: 'failed', transcript_error: outcome.error });
      return { episode_id: episodeId, status: 'failed', error: outcome.error };
    }
    await updateEpisode(episodeId, { transcript_status: 'skipped' });
    return {
      episode_id: episodeId,
      status: 'skipped',
      note: 'No free transcript found and no audio URL to transcribe.',
    };
  },
});

export const vectorSearchTool = createTool({
  id: 'vector_search',
  description:
    'Search the knowledge base by semantic similarity. Pass a plain text query — the embedding is generated internally.',
  inputSchema: z
    .object({
      query: z
        .string()
        .optional()
        .describe('Plain text query — preferred. The embedding is generated internally.'),
      queryEmbedding: z
        .array(z.number())
        .optional()
        .describe('Pre-computed embedding (advanced; pass `query` instead unless you have one)'),
      matchThreshold: z.number().default(0.7).describe('Minimum similarity score'),
      matchCount: z.number().default(10).describe('Max results to return'),
    })
    .refine((data) => data.query !== undefined || data.queryEmbedding !== undefined, {
      message: 'Either `query` (plain text) or `queryEmbedding` (number[]) must be provided.',
    }),
  execute: async (context) => {
    let embedding: number[];
    if (context.queryEmbedding) {
      embedding = context.queryEmbedding;
    } else {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: context.query!,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      embedding = response.data[0]?.embedding ?? [];
    }
    const results = await vectorSearch(embedding, {
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
  execute: async (context) => {
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
  execute: async (context) => {
    const results = await fulltextSearch(context.query, { limit: context.limit });
    return { results };
  },
});
