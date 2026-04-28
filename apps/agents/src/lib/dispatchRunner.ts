import { createRealtimeClient } from '@platform/db';

// Notes JSON shape written to agent_activity.notes (TEXT column, JSON-serialised)
export type ActivityNotes =
  | {
      phase: 'in_progress';
      dispatchMessage: string;
      dispatchActivityId: string;
      startedAt: string;
    }
  | {
      phase: 'completed';
      durationMs: number;
      dispatchActivityId: string;
      extra?: Record<string, unknown>;
    }
  | {
      phase: 'error';
      durationMs: number;
      dispatchActivityId: string;
      errorMessage: string;
      errorStack: string | null;
    };

export type DispatchRunnerSuccess = {
  entityType?: string;
  entityId?: string;
  approvedActions?: Record<string, unknown>[];
  extra?: Record<string, unknown>;
};

export type DispatchRunnerOptions<TResult> = {
  supabase: ReturnType<typeof createRealtimeClient>;
  agentName: string;
  dispatchActivityId: string;
  dispatchMessage: string;
  run: () => Promise<TResult>;
  onSuccess?: (result: TResult) => Promise<DispatchRunnerSuccess | void>;
};

export async function runDispatch<TResult>(opts: DispatchRunnerOptions<TResult>): Promise<void> {
  const { supabase, agentName, dispatchActivityId, dispatchMessage, run, onSuccess } = opts;
  const prefix = `[dispatch-runner:${agentName}]`;
  const startedAt = Date.now();

  // Log that the agent has picked up the task so the UI shows activity immediately
  const startNotes: ActivityNotes = {
    phase: 'in_progress',
    dispatchMessage,
    dispatchActivityId,
    startedAt: new Date(startedAt).toISOString(),
  };
  try {
    const { error } = await supabase.from('agent_activity').insert({
      agent_name: agentName,
      action: `Processing dispatch from activity ${dispatchActivityId}: ${dispatchMessage.slice(0, 120)}`,
      status: 'in_progress',
      trigger_type: 'agent',
      parent_activity_id: dispatchActivityId,
      workflow_run_id: null,
      entity_type: null,
      entity_id: null,
      proposed_actions: null,
      approved_actions: null,
      clarifications: null,
      notes: JSON.stringify(startNotes),
    } as never);
    if (error) console.error(`${prefix} Failed to insert in_progress log:`, error);
  } catch (err) {
    console.error(`${prefix} Failed to insert in_progress log:`, err);
  }

  let result: TResult;
  try {
    result = await run();
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorNotes: ActivityNotes = {
      phase: 'error',
      durationMs,
      dispatchActivityId,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? (err.stack ?? null) : null,
    };
    try {
      const { error } = await supabase.from('agent_activity').insert({
        agent_name: agentName,
        action: `Error processing dispatch from activity ${dispatchActivityId}: ${err instanceof Error ? err.message : String(err)}`,
        status: 'error',
        trigger_type: 'agent',
        parent_activity_id: dispatchActivityId,
        workflow_run_id: null,
        entity_type: null,
        entity_id: null,
        proposed_actions: null,
        approved_actions: null,
        clarifications: null,
        notes: JSON.stringify(errorNotes),
      } as never);
      if (error) console.error(`${prefix} Failed to insert error log:`, error);
    } catch (insertErr) {
      console.error(`${prefix} Failed to insert error log:`, insertErr);
    }
    return;
  }

  // Run any post-processing (entity persistence etc.) — if it throws, log as error
  let successMeta: DispatchRunnerSuccess = {};
  try {
    const returned = onSuccess ? await onSuccess(result) : undefined;
    if (returned) successMeta = returned;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorNotes: ActivityNotes = {
      phase: 'error',
      durationMs,
      dispatchActivityId,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? (err.stack ?? null) : null,
    };
    try {
      const { error } = await supabase.from('agent_activity').insert({
        agent_name: agentName,
        action: `Error persisting result from activity ${dispatchActivityId}: ${err instanceof Error ? err.message : String(err)}`,
        status: 'error',
        trigger_type: 'agent',
        parent_activity_id: dispatchActivityId,
        workflow_run_id: null,
        entity_type: null,
        entity_id: null,
        proposed_actions: null,
        approved_actions: null,
        clarifications: null,
        notes: JSON.stringify(errorNotes),
      } as never);
      if (error) console.error(`${prefix} Failed to insert persistence-error log:`, error);
    } catch (insertErr) {
      console.error(`${prefix} Failed to insert persistence-error log:`, insertErr);
    }
    return;
  }

  const durationMs = Date.now() - startedAt;
  const completedNotes: ActivityNotes = {
    phase: 'completed',
    durationMs,
    dispatchActivityId,
    extra: successMeta.extra,
  };
  try {
    const { error } = await supabase.from('agent_activity').insert({
      agent_name: agentName,
      action: `Completed task dispatched from activity ${dispatchActivityId}: ${dispatchMessage.slice(0, 120)}`,
      status: 'auto',
      trigger_type: 'agent',
      parent_activity_id: dispatchActivityId,
      workflow_run_id: null,
      entity_type: successMeta.entityType ?? null,
      entity_id: successMeta.entityId ?? null,
      proposed_actions: null,
      approved_actions: (successMeta.approvedActions ?? null) as never,
      clarifications: null,
      notes: JSON.stringify(completedNotes),
    } as never);
    if (error) console.error(`${prefix} Failed to insert completion log:`, error);
  } catch (insertErr) {
    console.error(`${prefix} Failed to insert completion log:`, insertErr);
  }
}
