/**
 * Generic routine execution workflow.
 *
 * Polled hourly by `routineListener`. On each tick, fetches any active
 * routines whose `next_run_at` has passed, dispatches each to the configured
 * agent for its `action_type`, persists the result, and reschedules
 * `next_run_at` based on the routine's frequency.
 *
 * Supersedes the older `monitorResearchWorkflow` (research_monitors only).
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { supabase } from '@platform/db';
import type { Database, Json } from '@platform/db';
import OpenAI from 'openai';
import type {
  ResearchBrief,
  ResearchResult,
  ResearchSource,
  RoutineActionType,
  RoutineFrequency,
  RoutineResult,
  NewsIngestionConfig,
  NewsCategory,
  NewsIngestResult,
} from '@platform/shared';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';
import { rex } from '../agents/researcher/index.js';
import { fetchUrl } from '../agents/researcher/tools.js';
import { computeNextRunAt } from '../lib/computeNextRunAt.js';
import { getModelConfig } from '../config/model.js';

// ── Step 1: Fetch due routines ───────────────────────────────────────────────

const routineSchema = z.object({
  id: z.string(),
  name: z.string(),
  agent_name: z.string(),
  action_type: z.string(),
  action_config: z.record(z.unknown()),
  frequency: z.string(),
  time_of_day: z.string(),
  timezone: z.string(),
});

const newsExtractionSchema = z.object({
  summary: z.string().min(40).max(500)
    .describe('A neutral 2–3 sentence summary of the article. Use capital B for the Bitcoin protocol/network and lowercase b for the currency unit.'),
  key_points: z.array(z.string()).min(3).max(7)
    .describe('3–7 short factual bullet points capturing the main claims, numbers, names, and dates from the article. No marketing language.'),
  topic_tags: z.array(z.string()).min(3).max(8)
    .describe('3–8 lowercase, hyphenated topic tags. Examples: "etf", "rba", "asx-listed", "treasury-strategy", "mining", "regulation".'),
  australian_relevance: z.boolean()
    .describe('true only if the article is about Australia, Australian entities, or has clear direct implications for Australian regulation, markets, or businesses.'),
});

const fetchDueRoutines = createStep({
  id: 'fetch_due_routines',
  inputSchema: z.object({
    triggered_at: z.string(),
  }),
  outputSchema: z.object({
    routines: z.array(routineSchema),
  }),
  execute: async () => {
    const { data, error } = await supabase
      .from('routines')
      .select('id, name, agent_name, action_type, action_config, frequency, time_of_day, timezone')
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(10);

    if (error) {
      const msg = (error as { message: string }).message;
      if (msg.includes('routines')) {
        console.warn('[routine-workflow] routines table not found — migration pending, skipping');
        return { routines: [] };
      }
      throw new Error(`Failed to fetch routines: ${msg}`);
    }

    return {
      routines: (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        agent_name: r.agent_name as string,
        action_type: r.action_type as string,
        action_config: (r.action_config as Record<string, unknown>) ?? {},
        frequency: r.frequency as string,
        time_of_day: r.time_of_day as string,
        timezone: r.timezone as string,
      })),
    };
  },
});

// ── Step 2: Run each routine ─────────────────────────────────────────────────

interface RoutineOutcome {
  routine_id: string;
  name: string;
  action_type: RoutineActionType;
  frequency: RoutineFrequency;
  time_of_day: string;
  timezone: string;
  status: 'success' | 'failed';
  result: RoutineResult | null;
  error: string | null;
  // Surfaced for monitor_change side-effects in step 3:
  has_changed?: boolean;
  change_summary?: string | null;
  notify_signal?: boolean;
  notify_agent?: string | null;
  // Source URLs to archive (populated when archive_sources is set):
  archive_urls?: string[];
  // news_ingest result counts:
  news_ingest_result?: NewsIngestResult;
}

const runRoutine = createStep({
  id: 'run_routine',
  inputSchema: z.object({
    routines: z.array(routineSchema),
  }),
  outputSchema: z.object({
    outcomes: z.array(z.any()),
  }),
  execute: async (params) => {
    const inputData = params.inputData as {
      routines: Array<z.infer<typeof routineSchema>>;
    };
    const outcomes: RoutineOutcome[] = [];

    for (const routine of inputData.routines) {
      try {
        if (routine.action_type === 'research_digest') {
          outcomes.push(await runResearchDigest(routine));
        } else if (routine.action_type === 'monitor_change') {
          outcomes.push(await runMonitorChange(routine));
        } else if (routine.action_type === 'news_ingest') {
          outcomes.push(await runNewsIngest(routine));
        } else {
          outcomes.push({
            routine_id: routine.id,
            name: routine.name,
            action_type: routine.action_type as RoutineActionType,
            frequency: routine.frequency as RoutineFrequency,
            time_of_day: routine.time_of_day,
            timezone: routine.timezone,
            status: 'failed',
            result: null,
            error: `Unknown action_type: ${routine.action_type}`,
          });
        }
      } catch (err) {
        console.error(`[routine-workflow] Error running routine ${routine.id}:`, err);
        outcomes.push({
          routine_id: routine.id,
          name: routine.name,
          action_type: routine.action_type as RoutineActionType,
          frequency: routine.frequency as RoutineFrequency,
          time_of_day: routine.time_of_day,
          timezone: routine.timezone,
          status: 'failed',
          result: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { outcomes };
  },
});

async function runResearchDigest(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as {
    subject?: string;
    context?: string;
    search_queries?: string[];
    archive_sources?: boolean;
    max_sources?: number;
  };

  const subject = cfg.subject ?? routine.name;
  const searchQueries = cfg.search_queries ?? [];
  const maxSources = cfg.max_sources ?? 10;

  const brief: ResearchBrief = {
    purpose: 'summarise',
    requester: 'simon',
    subject,
    context: [
      cfg.context ?? '',
      searchQueries.length ? `Search queries to run: ${searchQueries.join('; ')}` : '',
      `Return up to ${maxSources} distinct high-quality sources.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    urgency: 'async',
  };

  const response = await rex.generate([
    { role: 'user', content: JSON.stringify(brief) },
  ]);

  const parsed = extractResearchResult(response.text);
  const summary = parsed?.summary;
  const sources: ResearchSource[] = summary?.sources ?? [];

  const result: RoutineResult = {
    summary: summary ? [summary.headline, summary.body].filter(Boolean).join('\n\n') : response.text.slice(0, 2000),
    sources: sources.slice(0, maxSources),
    metadata: parsed?.metadata as Record<string, unknown> | undefined,
  };

  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'research_digest',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status: 'success',
    result,
    error: null,
    archive_urls: cfg.archive_sources ? result.sources.map((s) => s.url).filter(Boolean) : [],
  };
}

async function runMonitorChange(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as {
    subject?: string;
    context?: string;
    search_queries?: string[];
    notify_signal?: boolean;
    notify_agent?: string | null;
    last_digest?: string | null;
  };

  const subject = cfg.subject ?? routine.name;

  const brief: ResearchBrief = {
    purpose: 'monitor',
    requester: 'simon',
    subject,
    context: [
      cfg.context ?? '',
      cfg.search_queries?.length
        ? `Search queries to run: ${cfg.search_queries.join('; ')}`
        : '',
      cfg.last_digest
        ? `Prior digest (compare against this): ${cfg.last_digest}`
        : 'No prior digest — this is the first run for this routine.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    urgency: 'async',
  };

  const response = await rex.generate([
    { role: 'user', content: JSON.stringify(brief) },
  ]);

  const parsed = extractResearchResult(response.text);
  const monitor = parsed?.monitor;
  const currentDigest = monitor?.current_digest ?? response.text.slice(0, 500);
  const sources: ResearchSource[] = monitor?.sources ?? [];

  const result: RoutineResult = {
    digest: currentDigest,
    summary: monitor?.change_summary ?? undefined,
    sources,
  };

  return {
    routine_id: routine.id,
    name: routine.name,
    action_type: 'monitor_change',
    frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day,
    timezone: routine.timezone,
    status: 'success',
    result,
    error: null,
    has_changed: monitor?.has_changed ?? false,
    change_summary: monitor?.change_summary ?? null,
    notify_signal: cfg.notify_signal ?? false,
    notify_agent: cfg.notify_agent ?? null,
  };
}

let newsExtractorAgent: Agent | null = null;
function getNewsExtractor(): Agent {
  if (!newsExtractorAgent) {
    newsExtractorAgent = new Agent({
      id: 'newsExtractor',
      name: 'newsExtractor',
      instructions:
        'You extract structured metadata from news articles for a Bitcoin treasury research database. ' +
        'Be neutral and factual. Capital B = the Bitcoin protocol/network; lowercase b = the currency unit. ' +
        'Avoid marketing language. Topic tags must be lowercase and hyphenated.\n\n' +
        'Return ONLY a single JSON object — no prose, no code fences — with these keys:\n' +
        '  - summary: string, 2–3 neutral sentences (40–500 characters total)\n' +
        '  - key_points: array of 3–7 short factual strings (claims, numbers, names, dates)\n' +
        '  - topic_tags: array of 3–8 lowercase hyphenated tag strings (e.g. "etf", "asx-listed", "treasury-strategy")\n' +
        '  - australian_relevance: boolean — true only if the article is about Australia, Australian entities, or has clear direct implications for Australian regulation, markets, or businesses.',
      model: getModelConfig(),
    });
  }
  return newsExtractorAgent;
}

async function extractNewsMetadata(input: {
  title: string;
  source: string;
  category: NewsCategory;
  content: string;
}): Promise<z.infer<typeof newsExtractionSchema> | null> {
  const prompt =
    `Category hint: ${input.category}\n` +
    `Title: ${input.title}\n` +
    `Source: ${input.source}\n\n` +
    `Article:\n${input.content}\n\n` +
    `Return the JSON object now.`;

  const response = await getNewsExtractor().generate([
    { role: 'user', content: prompt },
  ]);

  const match = response.text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.warn('[news-ingest] extraction returned no JSON object', {
      title: input.title,
      preview: response.text.slice(0, 200),
    });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch (err) {
    console.warn('[news-ingest] extraction JSON parse failed', {
      title: input.title,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const parsed = newsExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[news-ingest] extraction schema validation failed', {
      title: input.title,
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

async function runNewsIngest(
  routine: z.infer<typeof routineSchema>,
): Promise<RoutineOutcome> {
  const cfg = routine.action_config as NewsIngestionConfig;
  const category = cfg.category;
  const queries = cfg.queries ?? [];
  const maxPerQuery = cfg.max_results_per_query ?? 5;

  const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

  // Step 1: Collect Tavily news results across all queries, deduplicate by URL.
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title: string; summary: string; source: string; published_at: string | null; score: number }> = [];

  for (const query of queries) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env['TAVILY_API_KEY'],
          query,
          max_results: maxPerQuery,
          topic: 'news',
          days: 2,
          include_answer: false,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json() as { results?: Array<{ url: string; title: string; content: string; score: number; published_date?: string; source?: string }> };
      for (const r of data.results ?? []) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          candidates.push({
            url: r.url,
            title: r.title,
            summary: r.content?.slice(0, 500) ?? '',
            source: (r.source ?? new URL(r.url).hostname).replace(/^www\./, ''),
            published_at: r.published_date ?? null,
            score: r.score ?? 0,
          });
        }
      }
    } catch {
      // skip failed query, continue
    }
  }

  if (candidates.length === 0) {
    const result: RoutineResult = { summary: 'No new articles found.', sources: [] };
    return {
      routine_id: routine.id, name: routine.name,
      action_type: 'news_ingest', frequency: routine.frequency as RoutineFrequency,
      time_of_day: routine.time_of_day, timezone: routine.timezone,
      status: 'success', result, error: null,
      news_ingest_result: { category, items_found: 0, items_stored: 0, items_skipped_duplicate: 0 },
    };
  }

  // Step 2: Filter already-known URLs.
  const { data: existing } = await supabase
    .from('news_items')
    .select('url')
    .in('url', candidates.map((c) => c.url));
  const existingUrls = new Set((existing ?? []).map((r) => r.url as string));
  const newCandidates = candidates.filter((c) => !existingUrls.has(c.url));

  let itemsSkipped = candidates.length - newCandidates.length;
  let itemsStored = 0;

  for (const item of newCandidates) {
    try {
      // Step 3: Cheap snippet-based embedding for dedup.
      const dedupEmbRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: `${item.title} ${item.summary}`.trim(),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const dedupEmbedding = dedupEmbRes.data[0]?.embedding ?? null;

      // Step 4: Semantic deduplication — skip near-identical articles.
      if (dedupEmbedding) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: near } = await (supabase.rpc as any)('vector_search_news', {
          query_embedding: dedupEmbedding,
          match_threshold: 0.95,
          match_count: 1,
          filter_category: category,
          filter_days: 3,
        });
        if (near && near.length > 0) {
          itemsSkipped += 1;
          continue;
        }
      }

      // Step 5: Fetch full article body via Jina Reader.
      let bodyMarkdown: string | null = null;
      try {
        const fetched = await fetchUrl.execute!({ url: item.url } as never, {} as never) as
          | { title?: string; markdown?: string }
          | undefined;
        const md = fetched?.markdown?.trim();
        if (md && md.length > 200) bodyMarkdown = md;
      } catch {
        // body fetch failed; carry on with snippet-only enrichment
      }

      // Step 6: Structured extraction (summary, key_points, topic_tags, AU relevance).
      const extractionInput = bodyMarkdown ?? item.summary;
      const truncated = extractionInput.slice(0, 12000);
      let extracted: z.infer<typeof newsExtractionSchema> | null = null;
      try {
        extracted = await extractNewsMetadata({
          title: item.title,
          source: item.source,
          category,
          content: truncated,
        });
      } catch (err) {
        console.warn('[news-ingest] extraction threw — falling back to snippet', {
          title: item.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 7: Final embedding on title + curated summary for higher-quality search.
      const finalSummary = extracted?.summary ?? item.summary;
      const finalEmbRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: `${item.title}\n${finalSummary}`.trim(),
        dimensions: EMBEDDING_DIMENSIONS,
      });
      const finalEmbedding = finalEmbRes.data[0]?.embedding ?? dedupEmbedding;

      // Step 8: Insert.
      await supabase.from('news_items').insert({
        title: item.title,
        url: item.url,
        source_name: item.source,
        published_at: item.published_at,
        body_markdown: bodyMarkdown,
        summary: finalSummary,
        key_points: extracted?.key_points ?? [],
        topic_tags: extracted?.topic_tags ?? [],
        australian_relevance: extracted?.australian_relevance ?? true,
        category: category as NewsCategory,
        relevance_score: Math.min(1, item.score),
        embedding: finalEmbedding as unknown as string,
        routine_id: routine.id,
        ingested_by: 'rex',
      });
      itemsStored += 1;
    } catch (err) {
      console.warn('[news-ingest] item failed — skipping', {
        url: item.url,
        title: item.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ingestResult: NewsIngestResult = {
    category,
    items_found: candidates.length,
    items_stored: itemsStored,
    items_skipped_duplicate: itemsSkipped,
  };

  const result: RoutineResult = {
    summary: `Stored ${itemsStored} new ${category} articles (${itemsSkipped} skipped as duplicates).`,
    sources: candidates.slice(0, 5).map((c) => ({
      url: c.url,
      title: c.title,
      excerpt: c.summary,
      retrieved_at: new Date().toISOString(),
    })),
  };

  return {
    routine_id: routine.id, name: routine.name,
    action_type: 'news_ingest', frequency: routine.frequency as RoutineFrequency,
    time_of_day: routine.time_of_day, timezone: routine.timezone,
    status: 'success', result, error: null,
    news_ingest_result: ingestResult,
  };
}

function extractResearchResult(text: string): ResearchResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ResearchResult;
  } catch {
    return null;
  }
}

// ── Step 3: Persist, reschedule, archive ─────────────────────────────────────

const persistAndSchedule = createStep({
  id: 'persist_and_schedule',
  inputSchema: z.object({
    outcomes: z.array(z.any()),
  }),
  outputSchema: z.object({
    updated: z.number(),
    archived: z.number(),
  }),
  execute: async (params) => {
    const { outcomes } = params.inputData as { outcomes: RoutineOutcome[] };
    let archivedCount = 0;

    for (const outcome of outcomes) {
      const nextRunAt = computeNextRunAt({
        frequency: outcome.frequency,
        timeOfDay: outcome.time_of_day,
        timezone: outcome.timezone,
      });

      const update: Database['public']['Tables']['routines']['Update'] = {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt.toISOString(),
        last_status: outcome.status,
        last_error: outcome.error,
        last_result: outcome.result as Json | null,
      };

      // For monitor_change, preserve the rolling digest in action_config.
      if (outcome.action_type === 'monitor_change' && outcome.status === 'success' && outcome.result?.digest) {
        const { data: existing } = await supabase
          .from('routines')
          .select('action_config')
          .eq('id', outcome.routine_id)
          .single();
        if (existing) {
          const cfg = { ...((existing.action_config as Record<string, unknown>) ?? {}), last_digest: outcome.result.digest };
          (update as Record<string, unknown>)['action_config'] = cfg as unknown as Json;
        }
      }

      await supabase.from('routines').update(update).eq('id', outcome.routine_id);

      // Audit: one row per run.
      await supabase.from('agent_activity').insert({
        agent_name: outcome.action_type === 'research_digest' ? 'rex' : 'rex',
        action: `Routine run: ${outcome.name}`,
        status: outcome.status === 'success' ? 'auto' : 'error',
        trigger_type: 'scheduled',
        entity_type: 'routine',
        entity_id: outcome.routine_id,
        approved_actions: outcome.result
          ? ([outcome.result as unknown as Record<string, unknown>] as Json)
          : null,
        notes: outcome.error ?? outcome.change_summary ?? null,
      });

      // monitor_change notify flow.
      // The previous implementation wrote a proposed_actions row that the deleted
      // specialist dispatch listeners (archivist/ba/recorder/relationshipManager/
      // researcher) consumed. After the supervisor migration those listeners are
      // gone; this row remains as an audit trail only. Re-wiring monitor_change to
      // delegate via Simon's supervisor (or to invoke the target agent directly)
      // is deferred to the Tier 1.4 split of this workflow.
      if (
        outcome.action_type === 'monitor_change' &&
        outcome.has_changed &&
        outcome.notify_agent
      ) {
        await supabase.from('agent_activity').insert({
          agent_name: 'simon',
          action: `Research monitor "${outcome.name}" detected changes: ${outcome.change_summary ?? ''}`,
          status: 'auto',
          trigger_type: 'scheduled',
          proposed_actions: [
            {
              agent: outcome.notify_agent,
              message: `Research monitor update — ${outcome.name}: ${outcome.change_summary ?? ''}`,
              context: {
                routine_id: outcome.routine_id,
                current_digest: outcome.result?.digest,
              },
            },
          ] as Json,
        });
      }

      // Archive sources to knowledge_items when requested.
      if (outcome.archive_urls?.length) {
        archivedCount += await archiveSources(outcome);
      }
    }

    return { updated: outcomes.length, archived: archivedCount };
  },
});

async function archiveSources(outcome: RoutineOutcome): Promise<number> {
  let archived = 0;
  for (const url of outcome.archive_urls ?? []) {
    try {
      // Skip if URL already archived.
      const { data: existing } = await supabase
        .from('knowledge_items')
        .select('id')
        .eq('source_url', url)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const fetched = await fetchUrl.execute!({ url } as never, {} as never) as
        | { title?: string; markdown?: string; retrieved_at?: string }
        | undefined;
      if (!fetched?.markdown) continue;

      const source = outcome.result?.sources.find((s) => s.url === url);
      const title = source?.title ?? fetched.title ?? url;

      await supabase.from('knowledge_items').insert({
        title,
        source_url: url,
        source_type: 'article',
        raw_content: fetched.markdown,
        summary: source?.excerpt ?? null,
        topic_tags: [outcome.name],
        archived_by: 'rex',
      });
      archived += 1;
    } catch (err) {
      console.warn(`[routine-workflow] archive failed for ${url}:`, err);
    }
  }
  return archived;
}

// ── Assemble workflow ────────────────────────────────────────────────────────

export const executeRoutineWorkflow = createWorkflow({
  id: 'execute_routine',
  inputSchema: z.object({ triggered_at: z.string() }),
  outputSchema: z.object({
    updated: z.number(),
    archived: z.number(),
  }),
})
  .then(fetchDueRoutines)
  .then(runRoutine)
  .then(persistAndSchedule)
  .commit();
