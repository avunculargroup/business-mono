import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildTelnyxRecordingEvent } from '../../test/factories.js';

const start = vi.fn().mockResolvedValue({ runId: 'r1' });
const createRun = vi.fn().mockResolvedValue({ start });
const getWorkflow = vi.fn().mockReturnValue({ createRun });

vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow },
}));

const { handleTelnyxWebhook } = await import('./telnyx.js');

function makeRequest(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/webhooks/telnyx', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

describe('handleTelnyxWebhook', () => {
  beforeEach(() => {
    start.mockClear();
    createRun.mockClear();
    getWorkflow.mockClear();
    // No public key set → signature verification is skipped (early-return true).
    // The webhook also logs a one-line warning when this happens; silence it
    // to keep test output clean.
    vi.stubEnv('TELNYX_PUBLIC_KEY', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('triggers the recorder workflow on call.recording.saved with mp3 url', async () => {
    const event = buildTelnyxRecordingEvent({
      callControlId: 'call_xyz',
      mp3: 'https://telnyx.example.com/rec.mp3',
    });

    const res = await handleTelnyxWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(getWorkflow).toHaveBeenCalledWith('recorder');
    expect(start).toHaveBeenCalledWith({
      inputData: {
        source: 'telnyx',
        callControlId: 'call_xyz',
        recordingUrl: 'https://telnyx.example.com/rec.mp3',
        channels: 'dual',
      },
    });
  });

  it('prefers mp3 over wav when both are present', async () => {
    const event = buildTelnyxRecordingEvent({ mp3: 'https://x/a.mp3', wav: 'https://x/a.wav' });
    await handleTelnyxWebhook(makeRequest(event));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ inputData: expect.objectContaining({ recordingUrl: 'https://x/a.mp3' }) }),
    );
  });

  it('falls back to wav when no mp3 is provided', async () => {
    const event = {
      data: {
        event_type: 'call.recording.saved',
        payload: {
          call_control_id: 'c_1',
          recording_urls: { wav: 'https://x/only.wav' },
        },
      },
    };
    await handleTelnyxWebhook(makeRequest(event));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ inputData: expect.objectContaining({ recordingUrl: 'https://x/only.wav' }) }),
    );
  });

  it('returns 400 when no recording URL is present', async () => {
    const event = {
      data: {
        event_type: 'call.recording.saved',
        payload: { call_control_id: 'c_1', recording_urls: {} },
      },
    };
    const res = await handleTelnyxWebhook(makeRequest(event));
    expect(res.status).toBe(400);
    expect(start).not.toHaveBeenCalled();
  });

  it('returns 200 and ignores unrelated event types', async () => {
    const event = buildTelnyxRecordingEvent({ eventType: 'call.initiated' });
    const res = await handleTelnyxWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(start).not.toHaveBeenCalled();
  });

  // Note: the signature-fails-with-key-configured path is not unit-tested here
  // because TELNYX_PUBLIC_KEY is read at module load and can't be stubbed
  // after the fact. Covered by integration testing against staging Telnyx.
});
