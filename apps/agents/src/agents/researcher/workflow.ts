import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@platform/db';
import { researcher } from './index.js';

import type { ResearchBrief, ResearchResult } from '@platform/shared';

// Type-safe helper — research_monitors isn't in generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const monitorsTable = () => supabase.from('research_monitors' as never) as any;

// ─── Step 1: Fetch due monitors ─────────────────────────────────────────────

const fetchDueMonitors = createStep({
  id: 'fetch_due_monitors',
  inputSchema: z.object({
    triggered_at: z.string().describe('ISO 8601 timestamp of when this run was triggered'),
  }),
  outputSchema: z.object({
    monitors: z.array(
      z.object({
        id: z.string(),
        subject: z.string(),
        context: z.string().nullable(),
        search_queries: z.array(z.string()),
        frequency: z.string(),
        last_digest: z.string().nullable(),
        notify_signal: z.boolean(),
        notify_agent: z.string().nullable(),
      }),
    ),
  }),
  execute: async () => {
    const { data, error } = await monitorsTable()
      .select(
        'id, subject, context, search_queries, frequency, last_digest, notify_signal, notify_agent',
      )
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(10);

    if (error) throw new Error(`Failed to fetch monitors: ${(error as { message: string }).message}`);

    type MonitorRow = Record<string, unknown>;
    return {
      monitors: ((data as MonitorRow[] | null) ?? []).map((m) => ({
        id: m['id'] as string,
        subject: m['subject'] as string,
        context: (m['context'] as string) ?? null,
        search_queries: m['search_queries'] as string[],
        frequency: m['frequency'] as string,
        last_digest: (m['last_digest'] as string) ?? null,
        notify_signal: m['notify_signal'] as boolean,
        notify_agent: (m['notify_agent'] as string) ?? null,
      })),
    };
  },
});

// ─── Step 2: Run monitor checks ─────────────────────────────────────────────

const runMonitorChecks = createStep({
  id: 'run_monitor_checks',
  inputSchema: z.object({
    monitors: z.array(
      z.object({
        id: z.string(),
        subject: z.string(),
        context: z.string().nullable(),
        search_queries: z.array(z.string()),
        frequency: z.string(),
        last_digest: z.string().nullable(),
        notify_signal: z.boolean(),
        notify_agent: z.string().nullable(),
      }),
    ),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        monitor_id: z.string(),
        has_changed: z.boolean(),
        change_summary: z.string().nullable(),
        current_digest: z.string(),
        notify_signal: z.boolean(),
        notify_agent: z.string().nullable(),
        subject: z.string(),
      }),
    ),
  }),
  execute: async ({ inputData }) => {
    const results: Array<{
      monitor_id: string;
      has_changed: boolean;
      change_summary: string | null;
      current_digest: string;
      notify_signal: boolean;
      notify_agent: string | null;
      subject: string;
    }> = [];

    for (const monitor of inputData.monitors) {
      const brief: ResearchBrief = {
        purpose: 'monitor',
        requester: 'simon',
        subject: monitor.subject,
        context: [
          monitor.context ?? '',
          `Search queries to run: ${monitor.search_queries.join('; ')}`,
          monitor.last_digest
            ? `Prior digest (compare against this): ${monitor.last_digest}`
            : 'No prior digest — this is the first run for this monitor.',
        ].join('\n\n'),
        monitor_id: monitor.id,
        urgency: 'async',
      };

      try {
        const response = await researcher.generate([
          { role: 'user', content: JSON.stringify(brief) },
        ]);

        let result: ResearchResult | null = null;
        try {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) result = JSON.parse(jsonMatch[0]) as ResearchResult;
        } catch {
          /* parse failed */
        }

        const monitorResult = result?.monitor;
        results.push({
          monitor_id: monitor.id,
          has_changed: monitorResult?.has_changed ?? false,
          change_summary: monitorResult?.change_summary ?? null,
          current_digest: monitorResult?.current_digest ?? response.text.slice(0, 500),
          notify_signal: monitor.notify_signal,
          notify_agent: monitor.notify_agent,
          subject: monitor.subject,
        });
      } catch (err) {
        console.error(
          `[monitor-workflow] Error running monitor ${monitor.id}:`,
          err,
        );
        results.push({
          monitor_id: monitor.id,
          has_changed: false,
          change_summary: null,
          current_digest: monitor.last_digest ?? '',
          notify_signal: false,
          notify_agent: null,
          subject: monitor.subject,
        });
      }
    }

    return { results };
  },
});

// ─── Step 3: Update monitors and notify ─────────────────────────────────────

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  fortnightly: 14 * 24 * 60 * 60 * 1000,
};

const updateAndNotify = createStep({
  id: 'update_and_notify',
  inputSchema: z.object({
    results: z.array(
      z.object({
        monitor_id: z.string(),
        has_changed: z.boolean(),
        change_summary: z.string().nullable(),
        current_digest: z.string(),
        notify_signal: z.boolean(),
        notify_agent: z.string().nullable(),
        subject: z.string(),
      }),
    ),
  }),
  outputSchema: z.object({
    updated: z.number(),
    changes_detected: z.number(),
  }),
  execute: async ({ inputData }) => {
    let changesDetected = 0;

    for (const result of inputData.results) {
      // Fetch the monitor to get frequency for next_run_at calculation
      const { data: monitor } = await monitorsTable()
        .select('frequency')
        .eq('id', result.monitor_id)
        .single();

      const frequency = ((monitor as Record<string, unknown> | null)?.['frequency'] as string) ?? 'weekly';
      const intervalMs = FREQUENCY_MS[frequency] ?? FREQUENCY_MS['weekly']!;
      const nextRunAt = new Date(Date.now() + intervalMs).toISOString();

      // Update the monitor record
      await monitorsTable()
        .update({
          last_digest: result.current_digest,
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt,
        })
        .eq('id', result.monitor_id);

      if (result.has_changed) {
        changesDetected++;

        // Log change detection to agent_activity
        await supabase.from('agent_activity').insert({
          agent_name: 'researcher',
          action: `Monitor change detected: ${result.subject}`,
          status: 'auto',
          trigger_type: 'scheduled',
          entity_type: 'research_monitor',
          entity_id: result.monitor_id,
          approved_actions: [
            {
              type: 'monitor_change',
              subject: result.subject,
              change_summary: result.change_summary,
              current_digest: result.current_digest,
            },
          ],
          notes: result.change_summary,
        } as never);

        // If notify_agent is set, create a dispatch for that agent
        if (result.notify_agent) {
          await supabase.from('agent_activity').insert({
            agent_name: 'simon',
            action: `Research monitor "${result.subject}" detected changes: ${result.change_summary}`,
            status: 'auto',
            trigger_type: 'scheduled',
            proposed_actions: [
              {
                agent: result.notify_agent,
                message: `Research monitor update — ${result.subject}: ${result.change_summary}`,
                context: {
                  monitor_id: result.monitor_id,
                  current_digest: result.current_digest,
                },
              },
            ],
          } as never);
        }
      }
    }

    return {
      updated: inputData.results.length,
      changes_detected: changesDetected,
    };
  },
});

// ─── Assemble workflow ───────────────────────────────────────────────────────

export const monitorResearchWorkflow = createWorkflow({
  id: 'monitor_research',
  inputSchema: z.object({
    triggered_at: z.string(),
  }),
})
  .then(fetchDueMonitors)
  .then(runMonitorChecks)
  .then(updateAndNotify)
  .commit();
