import type { createRealtimeClient } from '@platform/db';

type SupabaseClient = ReturnType<typeof createRealtimeClient>;
type RealtimeChannel = ReturnType<SupabaseClient['channel']>;
type SubscribeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED' | string;

export interface SubscribeWithReconnectOptions {
  client: SupabaseClient;
  channelName: string;
  logPrefix: string;
  attachHandlers: (channel: RealtimeChannel) => RealtimeChannel;
  onSubscribed?: () => void;
}

interface ChannelState {
  currentChannel: RealtimeChannel | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  hasEverSubscribed: boolean;
}

// Keyed by channelName so multiple listeners share no state.
const states = new Map<string, ChannelState>();

function getState(channelName: string): ChannelState {
  let s = states.get(channelName);
  if (!s) {
    s = { currentChannel: null, reconnectTimer: null, reconnectAttempt: 0, hasEverSubscribed: false };
    states.set(channelName, s);
  }
  return s;
}

/**
 * Subscribes to a Supabase Realtime channel with exponential-backoff
 * reconnection. Replaces hand-rolled scheduleReconnect / currentChannel /
 * reconnectAttempt blocks previously duplicated across pmListener,
 * contentCreatorListener, and webDirectives.
 *
 * Behaviour:
 * - Idempotent: calling twice for the same channelName tears down the old
 *   channel and reattaches a fresh subscription with reconnect attempt 0.
 * - On TIMED_OUT / CHANNEL_ERROR / CLOSED, schedules a reconnect with backoff
 *   starting at 5s and capping at 60s.
 * - On SUBSCRIBED, resets the attempt counter and invokes onSubscribed once
 *   per successful connect (every reconnect logs through it too).
 * - Subscription-status callbacks bound to a stale channel (one removed by a
 *   later restart) are ignored, matching the prior per-listener
 *   `if (channel !== currentChannel) return;` guard.
 */
export function subscribeWithReconnect(opts: SubscribeWithReconnectOptions): void {
  const { client, channelName, logPrefix, attachHandlers, onSubscribed } = opts;
  const state = getState(channelName);

  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  if (state.currentChannel !== null) {
    void client.removeChannel(state.currentChannel);
  }

  const scheduleReconnect = (reason?: string): void => {
    if (state.reconnectTimer !== null) return;
    state.reconnectAttempt += 1;
    const delay = Math.min(5000 * Math.pow(2, state.reconnectAttempt - 1), 60000);
    const scenario = state.hasEverSubscribed ? 'connection lost' : 'never connected';
    console.log(
      `${logPrefix} ${scenario} — reconnect attempt ${state.reconnectAttempt} in ${delay / 1000}s` +
      (reason ? ` (${reason})` : ''),
    );
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      subscribeWithReconnect(opts);
    }, delay);
  };

  const baseChannel = client.channel(channelName);
  const channelWithHandlers = attachHandlers(baseChannel);
  const channel = channelWithHandlers.subscribe((status: SubscribeStatus, err?: unknown) => {
    if (channel !== state.currentChannel) return;

    console.log(`${logPrefix} Subscription status:`, status);
    if (err) console.error(`${logPrefix} Subscription error:`, err);
    if (status === 'SUBSCRIBED') {
      state.hasEverSubscribed = true;
      state.reconnectAttempt = 0;
      onSubscribed?.();
    } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
      scheduleReconnect(err ? String(err) : status);
    } else if (status === 'CLOSED') {
      scheduleReconnect('CLOSED');
    }
  });

  state.currentChannel = channel;
}
