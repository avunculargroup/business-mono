import { describe, it, expect, vi, afterEach } from 'vitest';
import { subscribeWithReconnect } from './realtimeChannel.js';

/**
 * Minimal fake of the Supabase Realtime client surface that
 * subscribeWithReconnect touches: channel() -> { on, subscribe } and
 * removeChannel(). subscribe() returns the same channel object so the helper's
 * `channel !== state.currentChannel` staleness guard passes for the live one.
 */
function createFakeClient() {
  const callbacks: Array<(status: string, err?: unknown) => void> = [];
  const removeChannel = vi.fn(() => Promise.resolve('ok'));
  const channel = vi.fn((_name: string) => {
    const ch: Record<string, unknown> = {
      on: vi.fn(() => ch),
      subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
        callbacks.push(cb);
        return ch;
      }),
    };
    return ch;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { channel, removeChannel } as any;
  return { client, callbacks, removeChannel, channel };
}

describe('subscribeWithReconnect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('logs a concise message instead of dumping the raw socket error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { client, callbacks } = createFakeClient();

    subscribeWithReconnect({
      client,
      channelName: 'test-concise-log',
      logPrefix: '[test-concise]',
      attachHandlers: (c) => c,
    });

    // Realtime hands us an Error whose cause is the full CloseEvent/WebSocket.
    const err = new Error('socket closed: 1006');
    (err as Error & { cause?: unknown }).cause = { hugeWebSocketObject: 'with apikey in url' };
    callbacks.at(-1)!('CHANNEL_ERROR', err);

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith('[test-concise] Subscription error: socket closed: 1006');
    // A single string argument — the raw error object is never passed through.
    const [, ...rest] = errSpy.mock.calls[0];
    expect(rest).toHaveLength(0);
  });

  it('schedules an exponential-backoff reconnect on CHANNEL_ERROR', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { client, channel, callbacks } = createFakeClient();

    subscribeWithReconnect({
      client,
      channelName: 'test-reconnect',
      logPrefix: '[test-reconnect]',
      attachHandlers: (c) => c,
    });
    expect(channel).toHaveBeenCalledTimes(1);

    callbacks.at(-1)!('CHANNEL_ERROR', new Error('socket closed: 1006'));

    // First backoff is 5s; nothing happens before then.
    vi.advanceTimersByTime(4999);
    expect(channel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(channel).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending reconnect when the channel recovers on its own', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { client, channel, callbacks } = createFakeClient();

    subscribeWithReconnect({
      client,
      channelName: 'test-recovery',
      logPrefix: '[test-recovery]',
      attachHandlers: (c) => c,
    });

    const cb = callbacks.at(-1)!;
    cb('CHANNEL_ERROR', new Error('socket closed: 1006'));
    // Phoenix's own socket re-joins the channel before our timer fires.
    cb('SUBSCRIBED');

    vi.advanceTimersByTime(60000);
    // No teardown/resubscribe happened — still the single original channel.
    expect(channel).toHaveBeenCalledTimes(1);
  });
});
