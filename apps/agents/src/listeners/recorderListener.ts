import { createRealtimeClient } from '@platform/db';
import { runDispatch } from '../lib/dispatchRunner.js';
import { roger } from '../agents/recorder/agent.js';

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

        await runDispatch({
          supabase,
          agentName: 'roger',
          dispatchActivityId: row.id,
          dispatchMessage: dispatch.message,
          run: async () => roger.generate([{ role: 'user', content: dispatch.message }]),
          onSuccess: async (result) => ({ approvedActions: [{ response: result.text }] }),
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
