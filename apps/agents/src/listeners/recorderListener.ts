import { createRealtimeClient } from '@platform/db';

const supabase = createRealtimeClient();
import type { CoreMessage } from 'ai';
import { roger } from '../agents/recorder/agent.js';

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
    `[recorder-listener] ${scenario} — reconnect attempt ${reconnectAttempt} in ${delay / 1000}s` +
    (reason ? ` (${reason})` : '')
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startRecorderListener();
  }, delay);
}

export function startRecorderListener(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentChannel !== null) {
    void supabase.removeChannel(currentChannel);
  }

  const channel = supabase
    .channel('recorder-dispatches')
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'agent_activity' },
      async (payload: { new: ActivityRow }) => {
        const row = payload.new;
        const proposed = Array.isArray(row.proposed_actions)
          ? (row.proposed_actions as ProposedAction[])
          : [];

        const dispatch = proposed.find((a) => a.agent === 'roger');
        if (!dispatch) return;

        console.log(`[recorder-listener] Dispatch received from activity ${row.id}`);

        const messages: CoreMessage[] = [{ role: 'user', content: dispatch.message }];

        let responseText: string;
        try {
          const result = await roger.generate(messages);
          responseText = result.text;
        } catch (err) {
          console.error('[recorder-listener] Recorder error:', err);
          await supabase.from('agent_activity').insert({
            agent_name: 'roger',
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
          agent_name: 'roger',
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

        console.log(`[recorder-listener] Completed dispatch from activity ${row.id}`);
      }
    )
    .subscribe((status, err) => {
      if (channel !== currentChannel) return;

      console.log('[recorder-listener] Subscription status:', status);
      if (err) console.error('[recorder-listener] Subscription error:', err);
      if (status === 'SUBSCRIBED') {
        hasEverSubscribed = true;
        reconnectAttempt = 0;
        console.log('[recorder-listener] Listening for Recorder dispatches via Supabase Realtime');
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        scheduleReconnect(err ? String(err) : status);
      } else if (status === 'CLOSED') {
        scheduleReconnect('CLOSED');
      }
    });

  currentChannel = channel;
}
