import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import type { CoreMessage } from 'ai';
import { archie } from '../agents/archivist/index.js';

type ProposedAction = {
  agent: string;
  message: string;
  context?: Record<string, unknown>;
};

type ActivityRow = {
  id: string;
  proposed_actions: unknown;
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
    `[archivist-listener] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : '')
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startArchivistListener();
  }, delay);
}

export function startArchivistListener(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('archivist-dispatches')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'archie');
        if (!dispatch) return;

        console.log(`[archivist-listener] Dispatch received from activity ${row.id}`);

        const messages: CoreMessage[] = [{ role: 'user', content: dispatch.message }];

        let responseText: string;
        try {
          const result = await archie.generate(messages);
          responseText = result.text;
        } catch (err) {
          console.error('[archivist-listener] Archivist error:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'archie',
            action: `Error processing dispatch from activity ${row.id}: ${String(err)}`,
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

        await supabase.from('agent_activity').insert({
          agent_name: 'archie',
          action: `Completed task dispatched from activity ${row.id}: ${dispatch.message.slice(0, 120)}`,
          status: 'auto',
          trigger_type: 'agent',
          parent_activity_id: row.id,
          workflow_run_id: null,
          entity_type: null,
          entity_id: null,
          proposed_actions: null,
          approved_actions: [{ response: responseText }],
          clarifications: null,
          notes: null,
        } as never);

        console.log(`[archivist-listener] Completed dispatch from activity ${row.id}`);
      }
    )
    .subscribe((status, err) => {
      if (channel !== currentChannel) return;

      console.log('[archivist-listener] Subscription status:', status);
      if (err) console.error('[archivist-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[archivist-listener] Listening for Archivist dispatches via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
