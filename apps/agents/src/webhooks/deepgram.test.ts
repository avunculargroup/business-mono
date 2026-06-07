import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildDeepgramCallbackEvent } from '../../test/factories.js';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({
  get supabase() { return fake; },
}));

const resume = vi.fn().mockResolvedValue({ runId: 'r1' });
const createRun = vi.fn().mockResolvedValue({ resume });
const getWorkflow = vi.fn().mockReturnValue({ createRun });
vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow },
}));

const processPodcastTranscript = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/transcripts/processPodcastTranscript.js', () => ({ processPodcastTranscript }));

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
    processPodcastTranscript.mockClear();
    // Default: no matching podcast episode → recorder resume path.
    fake.__setResponse('podcast_episodes', { data: null, error: null });
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
    expect(processPodcastTranscript).not.toHaveBeenCalled();

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

  it('routes to the podcast process path when an episode matches the request_id', async () => {
    fake.__setResponse('podcast_episodes', { data: { id: 'episode_xyz' }, error: null });
    const event = buildDeepgramCallbackEvent({ requestId: 'req_podcast' });

    const res = await handleDeepgramWebhook(makeRequest(event));
    expect(res.status).toBe(200);
    expect(processPodcastTranscript).toHaveBeenCalledTimes(1);
    expect(processPodcastTranscript.mock.calls[0][0]).toBe('episode_xyz');
    // The recorder must NOT be resumed for a podcast callback.
    expect(getWorkflow).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('returns 400 when request_id is missing', async () => {
    const event = { metadata: {}, results: { channels: [], utterances: [] } };
    const res = await handleDeepgramWebhook(makeRequest(event));
    expect(res.status).toBe(400);
    expect(createRun).not.toHaveBeenCalled();
    expect(processPodcastTranscript).not.toHaveBeenCalled();
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
