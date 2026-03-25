import { supabase } from '@platform/db';
import type { CoreMessage } from 'ai';
import { ba } from '../agents/ba/index.js';

type ProposedAction = {
  agent: string;
  message: string;
  context?: Record<string, unknown>;
};

type ActivityRow = {
  id: string;
  proposed_actions: unknown;
};

// Module-level state so reconnect logic is properly deduped across calls
let currentChannel: ReturnType<typeof supabase.channel> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  console.log('[ba-listener] Reconnecting in 5s...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBAListener();
  }, 5000);
}

/**
 * Subscribes to agent_activity via Supabase Realtime.
 * When Simon dispatches to ba, invokes ba.generate() with the provided
 * message and logs the result back to agent_activity.
 */
export function startBAListener(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
    currentChannel = null;
  }

  currentChannel = supabase
    .channel('ba-dispatches')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'ba');
        if (!dispatch) return;

        console.log(`[ba-listener] Dispatch received from activity ${row.id}`);

        const messages: CoreMessage[] = [{ role: 'user', content: dispatch.message }];

        let responseText: string;
        try {
          const result = await ba.generate(messages);
          responseText = result.text;
        } catch (err) {
          console.error('[ba-listener] BA error:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'ba',
            action: `Error processing dispatch from activity ${row.id}: ${String(err)}`,
            status: 'error',
            trigger_type: 'agent',
            workflow_run_id: null,
            entity_type: null,
            entity_id: null,
            proposed_actions: null,
            approved_actions: null,
            clarifications: null,
            notes: null,
          });
          return;
        }

        await supabase.from('agent_activity').insert({
          agent_name: 'ba',
          action: `Completed task dispatched from activity ${row.id}: ${dispatch.message.slice(0, 120)}`,
          status: 'auto',
          trigger_type: 'agent',
          workflow_run_id: null,
          entity_type: null,
          entity_id: null,
          proposed_actions: null,
          approved_actions: [{ response: responseText }],
          clarifications: null,
          notes: null,
        });

        console.log(`[ba-listener] Completed dispatch from activity ${row.id}`);
      }
    )
    .subscribe((status, err) => {
      console.log('[ba-listener] Subscription status:', status);
      if (err) console.error('[ba-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        console.log('Listening for BA dispatches via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect();
      } else if (status === 'CLOSED') {
        scheduleReconnect();
      }
    });
}
