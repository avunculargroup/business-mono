import { describe, it, expect, vi, afterEach } from 'vitest';

// Capture the component logger the module binds, but keep the real describeError
// (the helper that flattens an Error to its message so the raw socket object —
// apikey/JWT in its URL — is never logged).
const errorSpy = vi.fn();
const infoSpy = vi.fn();
vi.mock('../../lib/logger.js', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/logger.js')>();
  return {
    ...actual,
    createLogger: () => ({ info: infoSpy, warn: vi.fn(), error: errorSpy, debug: vi.fn() }),
  };
});

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
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('logs a concise message instead of dumping the raw socket error', () => {
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

    expect(errorSpy).toHaveBeenCalledTimes(1);
    // The err field is the flattened message string — never the raw Error object,
    // so the credential-bearing cause can't leak into the log stream.
    expect(errorSpy).toHaveBeenCalledWith({ err: 'socket closed: 1006' }, 'subscription error');
  });

  it('schedules an exponential-backoff reconnect on CHANNEL_ERROR', () => {
    vi.useFakeTimers();
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
