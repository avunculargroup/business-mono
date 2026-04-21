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
import { z } from 'zod';
import { supabase } from '@platform/db';
import type { Database, Json } from '@platform/db';
import type {
  ResearchBrief,
  ResearchResult,
  ResearchSource,
  RoutineActionType,
  RoutineFrequency,
  RoutineResult,
} from '@platform/shared';
import { rex } from '../agents/researcher/index.js';
import { fetchUrl } from '../agents/researcher/tools.js';
import { computeNextRunAt } from '../lib/computeNextRunAt.js';

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

      // monitor_change notify flow (preserves legacy behaviour).
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
