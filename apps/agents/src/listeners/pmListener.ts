import type { Mastra } from '@mastra/core';
import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import { petra } from '../agents/pm/agent.js';

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

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasEverSubscribed = false;
let mastraInstance: Mastra | null = null;

function scheduleReconnect(reason?: string): void {
  if (reconnectTimer !== null) return;
  reconnectAttempt += 1;
  const delay = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 60000);
  const scenario = hasEverSubscribed ? 'connection lost' : 'never connected';
  console.log(
    `[pm-listener] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : '')
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (mastraInstance) startPMListener(mastraInstance);
  }, delay);
}

/**
 * Uses pmAgent to parse a free-text dispatch message into the structured
 * input expected by pmWorkflow.
 */
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
  } catch { /* fall back to defaults */ }

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

/**
 * Subscribes to agent_activity via Supabase Realtime.
 * When Simon dispatches to pm, parses the free-text message into structured
 * workflow input and executes pmWorkflow.
 */
export function startPMListener(mastra: Mastra): void {
  mastraInstance = mastra;

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('pm-dispatches')
    .on(
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

        let workflowInput: WorkflowInput;
        try {
          workflowInput = await parseDispatchToWorkflowInput(
            dispatch.message,
            row.id,
            dispatch.context,
          );
        } catch (err) {
          console.error('[pm-listener] Failed to parse dispatch:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'petra',
            action: `Error parsing dispatch from activity ${row.id}: ${String(err)}`,
            status: 'error',
            trigger_type: 'agent',
            parent_activity_id: row.id,
            workflow_run_id: null,
            entity_type: null,
            entity_id: null,
            proposed_actions: null,
            approved_actions: null,
            clarifications: null,
            notes: null,
          } as never);
          return;
        }

        try {
          const run = await mastra.getWorkflow('pm').createRun();
          const result = await run.start({ inputData: workflowInput });
          console.log(`[pm-listener] Workflow run completed for activity ${row.id}:`, result);

          await supabase.from('agent_activity').insert({
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
            notes: null,
          } as never);
        } catch (err) {
          console.error('[pm-listener] PM workflow error:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'petra',
            action: `Error executing workflow for dispatch from activity ${row.id}: ${String(err)}`,
            status: 'error',
            trigger_type: 'agent',
            parent_activity_id: row.id,
            workflow_run_id: null,
            entity_type: null,
            entity_id: null,
            proposed_actions: null,
            approved_actions: null,
            clarifications: null,
            notes: null,
          } as never);
        }
      }
    )
    .subscribe((status, err) => {
      if (channel !== currentChannel) return;

      console.log('[pm-listener] Subscription status:', status);
      if (err) console.error('[pm-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[pm-listener] Listening for PM dispatches via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
