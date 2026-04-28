import { createRealtimeClient } from '@platform/db';
import { SignalClient } from '@platform/signal';
import { simon } from '../agents/simon/index.js';

const supabase = createRealtimeClient();
const signalClient = new SignalClient();

type CompletionRow = {
  id: string;
  agent_name: string;
  action: string;
  status: string;
  parent_activity_id: string | null;
  trigger_type: string | null;
  approved_actions: unknown;
};

type DispatchRow = {
  trigger_ref: string | null;
  action: string;
  proposed_actions: unknown;
};

type ProposedAction = {
  agent: string;
  message: string;
};

const SPECIALIST_DISPLAY_NAMES: Record<string, string> = {
  roger: 'Roger',
  archie: 'Archie',
  petra: 'Petra',
  bruno: 'Bruno',
  charlie: 'Charlie',
  rex: 'Rex',
  della: 'Della',
};

let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hasEverSubscribed = false;

function scheduleReconnect(reason?: string): void {
  if (reconnectTimer !== null) return;
  reconnectAttempt += 1;
  const delay = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 60000);
  const scenario = hasEverSubscribed ? 'connection lost' : 'never connected';
  console.log(
    `[simon-listener] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : ''),
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startSimonListener();
  }, delay);
}

/**
 * Subscribes to agent_activity via Supabase Realtime.
 * When a specialist logs a completion (success or error) linked to a Simon dispatch,
 * looks up the originating director's Signal ID and relays the result via Simon.
 */
export function startSimonListener(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('simon-completions')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: CompletionRow }) => {
        const row = payload.new;

        // Only process completion rows from specialists that are linked to a dispatch
        if (row.agent_name === 'simon') return;
        if (!row.parent_activity_id) return;
        if (row.trigger_type !== 'agent') return;

        console.log(
          `[simon-listener] Completion from ${row.agent_name} (activity ${row.id}, parent ${row.parent_activity_id})`,
        );

        // Look up the original dispatch to find the director's Signal ID
        const { data: parent, error: parentError } = await supabase
          .from('agent_activity')
          .select('trigger_ref, action, proposed_actions')
          .eq('id', row.parent_activity_id)
          .single();

        if (parentError || !parent) {
          console.error('[simon-listener] Could not fetch parent dispatch:', parentError);
          return;
        }

        const dispatch = parent as unknown as DispatchRow;
        const directorSignalId = dispatch.trigger_ref;

        if (!directorSignalId) {
          // Dispatch was autonomous (no director origin) — nothing to relay
          console.log(
            `[simon-listener] No directorSignalId on parent ${row.parent_activity_id} — skipping relay`,
          );
          return;
        }

        // Extract original task from the dispatch's proposed_actions
        const proposed = Array.isArray(dispatch.proposed_actions)
          ? (dispatch.proposed_actions as ProposedAction[])
          : [];
        const originalTask = proposed[0]?.message ?? dispatch.action;

        // Extract the specialist's result
        const approved = Array.isArray(row.approved_actions)
          ? (row.approved_actions as Array<{ response?: string }>)
          : [];
        const resultText = approved[0]?.response ?? row.action;

        const isError = row.status === 'error';
        const displayName = SPECIALIST_DISPLAY_NAMES[row.agent_name] ?? row.agent_name;

        const relayPrompt = isError
          ? `${displayName} encountered an error on a task you dispatched.\n\nOriginal task: ${originalTask}\n\nError: ${row.action}\n\nCraft a brief Signal message notifying the director what failed and suggesting a next step.`
          : `${displayName} has completed a task you dispatched.\n\nOriginal task: ${originalTask}\n\nResult: ${resultText}\n\nCraft a brief Signal message relaying this to the director. Summarise — don't paste the raw output verbatim. Offer to share the full result if it's substantial.`;

        let responseText: string;
        try {
          const result = await simon.generate(relayPrompt, {
            memory: {
              resource: directorSignalId,
              thread: `signal-${directorSignalId}`,
            },
          });
          responseText = result.text;
        } catch (err) {
          console.error('[simon-listener] Simon generate error during relay:', err);
          return;
        }

        try {
          await signalClient.sendMessage({ recipients: [directorSignalId], message: responseText });
          console.log(
            `[simon-listener] Relayed ${displayName} ${isError ? 'error' : 'completion'} to ${directorSignalId}`,
          );
        } catch (err) {
          console.error('[simon-listener] Signal send error during relay:', err);
          return;
        }

        // Audit log for the relay itself
        await supabase.from('agent_activity').insert({
          agent_name: 'simon',
          action: `Relayed ${displayName} ${isError ? 'error' : 'completion'} to director: ${originalTask.slice(0, 100)}`,
          status: 'auto',
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
      },
    )
    .subscribe((status, err) => {
      if (channel !== currentChannel) return;

      console.log('[simon-listener] Subscription status:', status);
      if (err) console.error('[simon-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[simon-listener] Listening for specialist completions via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
