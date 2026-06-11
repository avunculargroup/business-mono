import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the call to the async callback method so we can assert the request is
// shaped correctly (the bug was using the synchronous transcribeUrl with a
// `callback` option, which Deepgram rejects).
const transcribeUrlCallback = vi.fn(
  async (
    ..._args: unknown[]
  ): Promise<{ result: { request_id: string } | null; error: unknown }> => ({
    result: { request_id: 'req-123' },
    error: null,
  }),
);

vi.mock('@deepgram/sdk', () => ({
  createClient: () => ({
    listen: { prerecorded: { transcribeUrlCallback } },
  }),
  // Minimal stand-in so `new CallbackUrl(url)` records the URL it was given.
  CallbackUrl: class {
    constructor(public url: string) {}
  },
}));

const { deepgramTranscribe } = await import('./deepgram.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (input: Record<string, unknown>) => deepgramTranscribe.execute!(input as any, {} as any);

describe('deepgramTranscribe', () => {
  beforeEach(() => {
    transcribeUrlCallback.mockClear();
  });

  it('submits via the async transcribeUrlCallback method with the callback url', async () => {
    const result = await run({
      audioUrl: 'https://example.com/audio.mp3',
      callbackUrl: 'https://app.example.com/webhooks/deepgram',
      multichannel: false,
      diarize: true,
    });

    expect(transcribeUrlCallback).toHaveBeenCalledTimes(1);
    const [source, callback, options] = transcribeUrlCallback.mock.calls[0] as [
      { url: string },
      { url: string },
      Record<string, unknown>,
    ];
    expect(source).toEqual({ url: 'https://example.com/audio.mp3' });
    expect(callback.url).toBe('https://app.example.com/webhooks/deepgram');
    // The callback must NOT be smuggled in as an option — that's what broke.
    expect(options).not.toHaveProperty('callback');
    expect(options).toMatchObject({ model: 'nova-3', diarize: true });
    expect(result).toEqual({ requestId: 'req-123' });
  });

  it('reads request_id from the top-level async response shape', async () => {
    transcribeUrlCallback.mockResolvedValueOnce({
      result: { request_id: 'async-id' },
      error: null,
    });

    const result = await run({
      audioUrl: 'https://example.com/a.mp3',
      callbackUrl: 'https://cb',
      multichannel: false,
      diarize: true,
    });

    expect(result).toEqual({ requestId: 'async-id' });
  });

  it('uses multichannel over diarize when set', async () => {
    await run({
      audioUrl: 'https://example.com/a.mp3',
      callbackUrl: 'https://cb',
      multichannel: true,
      diarize: true,
    });

    const options = transcribeUrlCallback.mock.calls[0]![2] as Record<string, unknown>;
    expect(options['multichannel']).toBe(true);
    expect(options).not.toHaveProperty('diarize');
  });

  it('throws when Deepgram returns an error', async () => {
    transcribeUrlCallback.mockResolvedValueOnce({ result: null, error: 'boom' });

    await expect(
      run({ audioUrl: 'https://x', callbackUrl: 'https://cb', multichannel: false, diarize: true }),
    ).rejects.toThrow('Deepgram transcription failed: boom');
  });
});
