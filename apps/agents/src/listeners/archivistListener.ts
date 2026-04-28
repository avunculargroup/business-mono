import { createRealtimeClient } from '@platform/db';
import { runDispatch } from '../lib/dispatchRunner.js';
import { archie } from '../agents/archivist/index.js';

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

        await runDispatch({
          supabase,
          agentName: 'archie',
          dispatchActivityId: row.id,
          dispatchMessage: dispatch.message,
          run: async () => archie.generate([{ role: 'user', content: dispatch.message }]),
          onSuccess: async (result) => ({ approvedActions: [{ response: result.text }] }),
        });

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
