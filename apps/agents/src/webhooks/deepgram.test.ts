import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildDeepgramCallbackEvent } from '../../test/factories.js';

const resume = vi.fn().mockResolvedValue({ runId: 'r1' });
const createRun = vi.fn().mockResolvedValue({ resume });
const getWorkflow = vi.fn().mockReturnValue({ createRun });

vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow },
}));

const { handleDeepgramWebhook } = await import('./deepgram.js');

function makeRequest(payload: unknown): Request {
  return new Request('https://example.com/webhooks/deepgram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('handleDeepgramWebhook', () => {
  beforeEach(() => {
    resume.mockClear();
    createRun.mockClear();
    getWorkflow.mockClear();
  });

  it('resumes the recorder workflow keyed by request_id with the built transcript', async () => {
    const event = buildDeepgramCallbackEvent({
      requestId: 'req_abc',
      utterances: [
        { transcript: 'Hello there', channel: 0, start: 0, end: 1 },
        { transcript: 'General Kenobi', channel: 1, start: 1, end: 2 },
      ],
    });

    const res = await handleDeepgramWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(getWorkflow).toHaveBeenCalledWith('recorder');
    expect(createRun).toHaveBeenCalledWith({ runId: 'req_abc' });

    const resumeArg = resume.mock.calls[0][0] as {
      resumeData: { transcript: string; requestId: string; channels: unknown };
    };
    expect(resumeArg.resumeData.requestId).toBe('req_abc');
    expect(resumeArg.resumeData.transcript).toBe('[Channel 0] Hello there\n[Channel 1] General Kenobi');
  });

  it('labels speakers when channel is absent', async () => {
    const event = buildDeepgramCallbackEvent({
      utterances: [
        { transcript: 'First voice', speaker: 0, start: 0, end: 1 },
        { transcript: 'Second voice', speaker: 1, start: 1, end: 2 },
      ],
    });
    await handleDeepgramWebhook(makeRequest(event));
    const resumeArg = resume.mock.calls[0][0] as { resumeData: { transcript: string } };
    expect(resumeArg.resumeData.transcript).toBe('[Speaker 0] First voice\n[Speaker 1] Second voice');
  });

  it('returns 400 when request_id is missing', async () => {
    const event = { metadata: {}, results: { channels: [], utterances: [] } };
    const res = await handleDeepgramWebhook(makeRequest(event));
    expect(res.status).toBe(400);
    expect(createRun).not.toHaveBeenCalled();
  });

  it('produces an empty transcript when utterances are missing', async () => {
    const event = {
      metadata: { request_id: 'req_empty' },
      results: { channels: [] },
    };
    await handleDeepgramWebhook(makeRequest(event));
    const resumeArg = resume.mock.calls[0][0] as { resumeData: { transcript: string } };
    expect(resumeArg.resumeData.transcript).toBe('');
  });
});
