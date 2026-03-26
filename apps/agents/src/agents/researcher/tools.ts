import { createTool } from '@mastra/core';
import { z } from 'zod';

// ============================================================
// search_web — Tavily Search API
// ============================================================

export const searchWeb = createTool({
  id: 'search_web',
  description:
    'Search the web using the Tavily Search API. Use search_depth "basic" for simple lookups, "advanced" for verification and deep research (costs more credits).',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Search query — keep semantic, 3–6 words for best results'),
    max_results: z
      .number()
      .default(5)
      .describe('Maximum number of results to return'),
    search_depth: z
      .enum(['basic', 'advanced'])
      .default('basic')
      .describe(
        'Use "advanced" only for verify and deep_research purposes',
      ),
  }),
  execute: async ({ context }) => {
    const apiKey = process.env['TAVILY_API_KEY'];
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY environment variable is not set');
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: context.query,
        max_results: context.max_results,
        search_depth: context.search_depth,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily search failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        url: string;
        title: string;
        content: string;
        score: number;
      }>;
    };

    return {
      results: (data.results ?? []).map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
        score: r.score,
      })),
    };
  },
});

// ============================================================
// fetch_url — Jina Reader (free, no API key)
// ============================================================

export const fetchUrl = createTool({
  id: 'fetch_url',
  description:
    'Fetch and extract clean markdown from any URL using Jina Reader. Preferred over crawl_structured for most cases.',
  inputSchema: z.object({
    url: z.string().url().describe('URL to fetch and extract content from'),
  }),
  execute: async ({ context }) => {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(context.url)}`;

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Jina Reader failed for ${context.url} (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as {
      data?: { title?: string; content?: string };
    };

    const title = data.data?.title ?? context.url;
    const markdown = (data.data?.content ?? '').slice(0, 50000);

    return {
      title,
      markdown,
      retrieved_at: new Date().toISOString(),
    };
  },
});

// ============================================================
// crawl_structured — Firecrawl (premium, use sparingly)
// ============================================================

export const crawlStructured = createTool({
  id: 'crawl_structured',
  description:
    'Extract structured data from complex web pages using Firecrawl. PREMIUM tool — only use when fetch_url returns empty/garbled content or when structured data extraction is specifically needed.',
  inputSchema: z.object({
    url: z.string().url().describe('URL to scrape'),
    extract_schema: z
      .record(z.unknown())
      .optional()
      .describe(
        'Optional JSON schema for guided extraction (e.g. { company_name: "string", board_members: "string[]" })',
      ),
  }),
  execute: async ({ context }) => {
    const apiKey = process.env['FIRECRAWL_API_KEY'];
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set');
    }

    const body: Record<string, unknown> = {
      url: context.url,
      formats: ['markdown'],
    };

    if (context.extract_schema) {
      body.formats = ['markdown', 'extract'];
      body.extract = { schema: context.extract_schema };
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Firecrawl scrape failed for ${context.url} (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as {
      data?: {
        markdown?: string;
        extract?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
    };

    return {
      markdown: (data.data?.markdown ?? '').slice(0, 50000),
      structured_data: data.data?.extract ?? null,
      metadata: data.data?.metadata ?? {},
    };
  },
});
