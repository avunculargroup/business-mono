import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import OpenAI from 'openai';
import { supabase } from '@platform/db';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

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
  execute: async (context) => {
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
  execute: async (context) => {
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
// search_news — Tavily News API (recency-sorted news articles)
// ============================================================

export const searchNews = createTool({
  id: 'search_news',
  description:
    'Search recent news articles using Tavily News API. Returns time-sorted results with publication dates. Prefer this over search_web for monitoring tasks, regulatory updates, and verifying recent events.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Search query — keep semantic, 3–6 words for best results'),
    max_results: z
      .number()
      .default(5)
      .describe('Maximum number of results to return'),
    days: z
      .number()
      .default(7)
      .describe('Only return articles published within this many days'),
  }),
  execute: async (context) => {
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
        topic: 'news',
        days: context.days,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily news search failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        url: string;
        title: string;
        content: string;
        score: number;
        published_date?: string;
      }>;
    };

    return {
      results: (data.results ?? []).map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
        score: r.score,
        published_date: r.published_date ?? null,
      })),
    };
  },
});

// ============================================================
// asx_lookup — ASX REST API (public, no auth required)
// ============================================================

export const asxLookup = createTool({
  id: 'asx_lookup',
  description:
    'Look up an ASX-listed company by its ASX code. Returns structured company profile (name, description, market cap, sector) and optionally recent market-sensitive announcements. Use before search_web when verifying Australian listed companies.',
  inputSchema: z.object({
    asx_code: z
      .string()
      .toUpperCase()
      .describe('ASX ticker code, e.g. "CBA", "BHP", "APT"'),
    include_announcements: z
      .boolean()
      .default(false)
      .describe('Whether to fetch recent market-sensitive ASX announcements'),
  }),
  execute: async (context) => {
    const code = context.asx_code.toUpperCase();

    const profileResponse = await fetch(
      `https://asx.com.au/asx/1/company/${encodeURIComponent(code)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)',
        },
      },
    );

    if (profileResponse.status === 404) {
      return {
        found: false,
        asx_code: code,
        profile: null,
        announcements: null,
      };
    }

    if (!profileResponse.ok) {
      const text = await profileResponse.text();
      throw new Error(
        `ASX profile lookup failed for ${code} (${profileResponse.status}): ${text}`,
      );
    }

    const profile = (await profileResponse.json()) as {
      code?: string;
      name_full?: string;
      name_abbrev?: string;
      name_short?: string;
      description?: string;
      principal_activities?: string;
      industry_group_name?: string;
      sector_name?: string;
      market_cap?: number;
      listing_date?: string;
      primary_share?: {
        last_price?: number;
        change_in_percent?: string;
      };
    };

    let announcements: Array<{
      date: string;
      title: string;
      url: string;
    }> | null = null;

    if (context.include_announcements) {
      const annResponse = await fetch(
        `https://asx.com.au/asx/1/company/${encodeURIComponent(code)}/announcements?count=20&market_sensitive=true`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; BTSResearcher/1.0)',
          },
        },
      );

      if (annResponse.ok) {
        const annData = (await annResponse.json()) as {
          data?: Array<{
            document_release_date?: string;
            header?: string;
            url?: string;
          }>;
        };
        announcements = (annData.data ?? []).map((a) => ({
          date: a.document_release_date ?? '',
          title: a.header ?? '',
          url: a.url ?? '',
        }));
      }
    }

    return {
      found: true,
      asx_code: code,
      profile: {
        name: profile.name_full ?? profile.name_abbrev ?? code,
        description: profile.description ?? profile.principal_activities ?? null,
        industry: profile.industry_group_name ?? null,
        sector: profile.sector_name ?? null,
        market_cap: profile.market_cap ?? null,
        listing_date: profile.listing_date ?? null,
        last_price: profile.primary_share?.last_price ?? null,
      },
      announcements,
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
  execute: async (context) => {
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

// ============================================================
// query_news_items — internal news feed (query before web search)
// ============================================================

export const queryNewsItems = createTool({
  id: 'query_news_items',
  description:
    'Query the internal news_items feed. Always call this BEFORE search_web or search_news. Returns recent aggregated articles relevant to the query. Use category to narrow scope. Returns empty when the feed has no matching items (then proceed to web search).',
  inputSchema: z.object({
    query: z.string().describe('Natural language query or topic to search for'),
    category: z
      .enum(['regulatory', 'corporate', 'macro', 'international'])
      .optional()
      .describe('Narrow to a specific news category'),
    days: z
      .number()
      .default(14)
      .describe('Only return articles published or fetched within this many days'),
    limit: z.number().default(10).describe('Maximum results to return'),
  }),
  execute: async (context) => {
    const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

    // Parallel: vector search + fulltext search
    const embRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: context.query,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embedding = embRes.data[0]?.embedding ?? [];

    const [vectorRows, ftRows] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('vector_search_news', {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: context.limit,
        filter_category: context.category ?? null,
        filter_days: context.days,
      }).then((r: { data: unknown[] | null }) => r.data ?? []),
      supabase
        .from('news_items')
        .select('id, title, summary, category, published_at, url, source_name, relevance_score')
        .textSearch('fts', context.query, { type: 'websearch' })
        .eq('status', 'new')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(context.limit)
        .then((r: { data: unknown[] | null }) => r.data ?? []),
    ]);

    // Merge and deduplicate by id, prefer vector results (have similarity score).
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...(ftRows as Record<string, unknown>[]), ...(vectorRows as Record<string, unknown>[])]) {
      byId.set(row['id'] as string, row);
    }

    const results = Array.from(byId.values()).slice(0, context.limit);

    return {
      count: results.length,
      results: results.map((r) => ({
        id: r['id'],
        title: r['title'],
        summary: r['summary'] ?? null,
        category: r['category'],
        published_at: r['published_at'] ?? null,
        url: r['url'],
        source_name: r['source_name'] ?? null,
        relevance_score: (r['relevance_score'] ?? r['similarity']) ?? null,
      })),
    };
  },
});
