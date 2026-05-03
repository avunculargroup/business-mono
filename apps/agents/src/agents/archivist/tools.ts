import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import OpenAI from 'openai';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';
import { vectorSearch, graphTraverse, fulltextSearch } from '@platform/db';

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

export const vectorSearchTool = createTool({
  id: 'vector_search',
  description: 'Search the knowledge base by semantic similarity using a natural language query',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    matchThreshold: z.number().default(0.7).describe('Minimum similarity score'),
    matchCount: z.number().default(10).describe('Max results to return'),
  }),
  execute: async (context) => {
    const embResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: context.query,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embedding = embResponse.data[0]?.embedding ?? [];
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
