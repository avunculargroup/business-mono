import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildZoomRecordingEvent } from '../../test/factories.js';

const start = vi.fn().mockResolvedValue({ runId: 'r1' });
const createRun = vi.fn().mockResolvedValue({ start });
const getWorkflow = vi.fn().mockReturnValue({ createRun });

vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow },
}));

const { handleZoomWebhook } = await import('./zoom.js');

const ZOOM_SECRET = 'test-zoom-secret';

function makeRequest(payload: unknown, opts: { timestamp?: string; sign?: boolean } = {}): Request {
  const body = JSON.stringify(payload);
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-zm-request-timestamp': timestamp,
  };
  if (opts.sign !== false) {
    const message = `v0:${timestamp}:${body}`;
    const sig = 'v0=' + createHmac('sha256', ZOOM_SECRET).update(message).digest('hex');
    headers['x-zm-signature'] = sig;
  } else {
    headers['x-zm-signature'] = 'v0=bad';
  }
  return new Request('https://example.com/webhooks/zoom', { method: 'POST', headers, body });
}

describe('handleZoomWebhook', () => {
  beforeEach(() => {
    start.mockClear();
    createRun.mockClear();
    getWorkflow.mockClear();
    vi.stubEnv('ZOOM_WEBHOOK_SECRET_TOKEN', ZOOM_SECRET);
  });

  it('triggers the recorder workflow on recording.completed with an MP4', async () => {
    const event = buildZoomRecordingEvent({ uuid: 'meeting_42', downloadUrl: 'https://zoom/r.mp4' });
    const res = await handleZoomWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(getWorkflow).toHaveBeenCalledWith('recorder');
    expect(start).toHaveBeenCalledWith({
      inputData: {
        source: 'zoom',
        meetingUuid: 'meeting_42',
        recordingUrl: 'https://zoom/r.mp4',
        channels: 'single',
      },
    });
  });

  it('answers the url_validation challenge without checking the signature', async () => {
    const event = {
      event: 'endpoint.url_validation',
      payload: { plainToken: 'tok123', object: { uuid: '', recording_files: [] } },
    };
    // Force a bad sig — challenge handler runs before verification.
    const res = await handleZoomWebhook(makeRequest(event, { sign: false }));
    expect(res.status).toBe(200);
    const body = await res.json() as { plainToken: string; encryptedToken: string };
    expect(body.plainToken).toBe('tok123');
    const expected = createHmac('sha256', ZOOM_SECRET).update('tok123').digest('hex');
    expect(body.encryptedToken).toBe(expected);
    expect(start).not.toHaveBeenCalled();
  });

  it('returns 401 for unrecognized signature', async () => {
    const event = buildZoomRecordingEvent();
    const res = await handleZoomWebhook(makeRequest(event, { sign: false }));
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it('ignores events other than recording.completed (200, no workflow run)', async () => {
    const event = buildZoomRecordingEvent({ event: 'meeting.started' });
    const res = await handleZoomWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(start).not.toHaveBeenCalled();
  });

  it('returns 200 with no workflow run when no MP4 file is present', async () => {
    const event = {
      event: 'recording.completed',
      payload: {
        object: {
          uuid: 'meeting_99',
          recording_files: [{ file_type: 'M4A', download_url: 'https://zoom/audio.m4a' }],
        },
      },
    };
    const res = await handleZoomWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(start).not.toHaveBeenCalled();
  });
});
