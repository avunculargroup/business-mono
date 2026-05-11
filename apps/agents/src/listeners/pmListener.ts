import type { Mastra } from '@mastra/core';
import { createRealtimeClient } from '@platform/db';
import { petra } from '../agents/pm/agent.js';
import type { ActivityNotes } from '../lib/dispatchRunner.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';

const supabase = createRealtimeClient();

type ProposedAction = {
  agent: string;
  message: string;
  context?: Record<string, unknown>;
};

type ActivityRow = {
  id: string;
  proposed_actions: unknown;
};

type WorkflowInput = {
  title: string;
  description?: string;
  sourceActivityId?: string;
  suggestedProjectId?: string;
  suggestedAssignee?: string;
  suggestedDueDate?: string;
  suggestedPriority?: 'low' | 'medium' | 'high' | 'urgent';
};

async function parseDispatchToWorkflowInput(
  message: string,
  sourceActivityId: string,
  context?: Record<string, unknown>,
): Promise<WorkflowInput> {
  const prompt = `Parse this task directive into structured fields for the PM workflow.

Directive: ${message}
${context ? `Additional context: ${JSON.stringify(context)}` : ''}

Return ONLY a JSON object with these fields:
{
  "title": "short task title (required)",
  "description": "fuller description (optional)",
  "suggestedProjectId": "UUID if mentioned, else null",
  "suggestedAssignee": "agent or person name if mentioned, else null",
  "suggestedDueDate": "ISO date string if mentioned, else null",
  "suggestedPriority": "low | medium | high | urgent — infer from tone/urgency, default medium"
}`;

  const result = await petra.generate([{ role: 'user', content: prompt }]);

  let parsed: Record<string, unknown> = { title: message.slice(0, 120) };
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (jsonParseErr) {
    console.warn('[pm-listener] JSON parse failed on petra output, using title-only fallback:', jsonParseErr);
  }

  return {
    title: (parsed['title'] as string | undefined) ?? message.slice(0, 120),
    description: (parsed['description'] as string | undefined) ?? undefined,
    sourceActivityId,
    suggestedProjectId: (parsed['suggestedProjectId'] as string | undefined) ?? undefined,
    suggestedAssignee: (parsed['suggestedAssignee'] as string | undefined) ?? undefined,
    suggestedDueDate: (parsed['suggestedDueDate'] as string | undefined) ?? undefined,
    suggestedPriority: (parsed['suggestedPriority'] as WorkflowInput['suggestedPriority']) ?? undefined,
  };
}

export function startPMListener(mastra: Mastra): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'pm-dispatches',
    logPrefix: '[pm-listener]',
    onSubscribed: () => {
      console.log('[pm-listener] Listening for PM dispatches via Supabase Realtime');
    },
    attachHandlers: (channel) => channel.on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'petra');
        if (!dispatch) return;

        console.log(`[pm-listener] Dispatch received from activity ${row.id}`);

        // Log that petra has started work so the UI shows activity immediately
        const startedAt = Date.now();
        const startNotes: ActivityNotes = {
          phase: 'in_progress',
          dispatchMessage: dispatch.message,
          dispatchActivityId: row.id,
          startedAt: new Date(startedAt).toISOString(),
        };
        try {
          const { error } = await supabase.from('agent_activity').insert({
            agent_name: 'petra',
            action: `Processing dispatch from activity ${row.id}: ${dispatch.message.slice(0, 120)}`,
            status: 'in_progress',
            trigger_type: 'agent',
            parent_activity_id: row.id,
            workflow_run_id: null,
            entity_type: null,
            entity_id: null,
            proposed_actions: null,
            approved_actions: null,
            clarifications: null,
            notes: JSON.stringify(startNotes),
          } as never);
          if (error) console.error('[pm-listener] Failed to insert in_progress log:', error);
        } catch (err) {
          console.error('[pm-listener] Failed to insert in_progress log:', err);
        }

        let workflowInput: WorkflowInput;
        try {
          workflowInput = await parseDispatchToWorkflowInput(
            dispatch.message,
            row.id,
            dispatch.context,
          );
        } catch (err) {
          const durationMs = Date.now() - startedAt;
          console.error('[pm-listener] Failed to parse dispatch:', err);
          const errorNotes: ActivityNotes = {
            phase: 'error',
            durationMs,
            dispatchActivityId: row.id,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? (err.stack ?? null) : null,
          };
          try {
            const { error } = await supabase.from('agent_activity').insert({
              agent_name: 'petra',
              action: `Error parsing dispatch from activity ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
              status: 'error',
              trigger_type: 'agent',
              parent_activity_id: row.id,
              workflow_run_id: null,
              entity_type: null,
              entity_id: null,
              proposed_actions: null,
              approved_actions: null,
              clarifications: null,
              notes: JSON.stringify(errorNotes),
            } as never);
            if (error) console.error('[pm-listener] Failed to insert parse-error log:', error);
          } catch (insertErr) {
            console.error('[pm-listener] Failed to insert parse-error log:', insertErr);
          }
          return;
        }

        try {
          const run = await mastra.getWorkflow('pm').createRun();
          const result = await run.start({ inputData: workflowInput });
          const durationMs = Date.now() - startedAt;
          console.log(`[pm-listener] Workflow run completed for activity ${row.id}:`, result);

          const completedNotes: ActivityNotes = {
            phase: 'completed',
            durationMs,
            dispatchActivityId: row.id,
          };
          try {
            const { error } = await supabase.from('agent_activity').insert({
              agent_name: 'petra',
              action: `Completed workflow for dispatch from activity ${row.id}: ${workflowInput.title}`,
              status: 'auto',
              trigger_type: 'agent',
              parent_activity_id: row.id,
              workflow_run_id: null,
              entity_type: null,
              entity_id: null,
              proposed_actions: null,
              approved_actions: [{ title: workflowInput.title, result }],
              clarifications: null,
              notes: JSON.stringify(completedNotes),
            } as never);
            if (error) console.error('[pm-listener] Failed to insert completion log:', error);
          } catch (insertErr) {
            console.error('[pm-listener] Failed to insert completion log:', insertErr);
          }
        } catch (err) {
          const durationMs = Date.now() - startedAt;
          console.error('[pm-listener] PM workflow error:', err);
          const errorNotes: ActivityNotes = {
            phase: 'error',
            durationMs,
            dispatchActivityId: row.id,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorStack: err instanceof Error ? (err.stack ?? null) : null,
          };
          try {
            const { error } = await supabase.from('agent_activity').insert({
              agent_name: 'petra',
              action: `Error executing workflow for dispatch from activity ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
              status: 'error',
              trigger_type: 'agent',
              parent_activity_id: row.id,
              workflow_run_id: null,
              entity_type: null,
              entity_id: null,
              proposed_actions: null,
              approved_actions: null,
              clarifications: null,
              notes: JSON.stringify(errorNotes),
            } as never);
            if (error) console.error('[pm-listener] Failed to insert workflow-error log:', error);
          } catch (insertErr) {
            console.error('[pm-listener] Failed to insert workflow-error log:', insertErr);
          }
        }
      }
    ),
  });
}
