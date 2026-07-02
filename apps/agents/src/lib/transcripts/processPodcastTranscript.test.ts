import { describe, it, expect, beforeEach, vi } from 'vitest';

const storeAvailableTranscript = vi.fn();
const updateEpisode = vi.fn().mockResolvedValue(undefined);
vi.mock('./store.js', () => ({
  storeAvailableTranscript: (...args: unknown[]) => storeAvailableTranscript(...args),
  updateEpisode: (...args: unknown[]) => updateEpisode(...args),
}));

const logActivityExecute = vi.fn();
vi.mock('../../tools/activity.js', () => ({
  logActivity: { execute: (...args: unknown[]) => logActivityExecute(...args) },
}));

const { processPodcastTranscript } = await import('./processPodcastTranscript.js');

const results = {
  utterances: [
    { transcript: 'Hello there', speaker: 0, start: 0, end: 1 },
    { transcript: 'General Kenobi', speaker: 1, start: 1, end: 2 },
  ],
};

describe('processPodcastTranscript', () => {
  beforeEach(() => {
    storeAvailableTranscript.mockReset().mockResolvedValue({ segments: 2 });
    updateEpisode.mockReset().mockResolvedValue(undefined);
    logActivityExecute.mockReset().mockResolvedValue(undefined);
  });

  it('stores the transcript with source deepgram and logs with an allowed trigger_type', async () => {
    await processPodcastTranscript('ep-1', results);

    expect(storeAvailableTranscript).toHaveBeenCalledWith(
      'ep-1',
      expect.objectContaining({ source: 'deepgram', hasTimestamps: true }),
    );
    const activityArg = logActivityExecute.mock.calls[0][0] as { triggerType: string };
    // 'webhook' is rejected by agent_activity_trigger_type_check; must be an allowed value.
    expect(activityArg.triggerType).toBe('scheduled');
    // The episode is left as stored ('available'); it is never demoted to 'failed'.
    expect(updateEpisode).not.toHaveBeenCalled();
  });

  it('does NOT demote a stored transcript to failed when the activity log write throws', async () => {
    logActivityExecute.mockRejectedValue(
      new Error('violates check constraint "agent_activity_trigger_type_check"'),
    );

    await expect(processPodcastTranscript('ep-1', results)).resolves.toBeUndefined();

    // The transcript was stored + embedded; a best-effort audit failure must not
    // roll it back to 'failed'.
    expect(storeAvailableTranscript).toHaveBeenCalledTimes(1);
    expect(updateEpisode).not.toHaveBeenCalled();
  });

  it('marks the episode failed when storing/embedding throws', async () => {
    storeAvailableTranscript.mockRejectedValue(new Error('embedding failed'));

    await processPodcastTranscript('ep-1', results);

    expect(updateEpisode).toHaveBeenCalledWith('ep-1', {
      transcript_status: 'failed',
      transcript_error: 'embedding failed',
    });
    expect(logActivityExecute).not.toHaveBeenCalled();
  });

  it('marks the episode failed when Deepgram returns no utterances', async () => {
    await processPodcastTranscript('ep-1', { utterances: [] });

    expect(updateEpisode).toHaveBeenCalledWith('ep-1', {
      transcript_status: 'failed',
      transcript_error: 'Deepgram returned no utterances',
    });
    expect(storeAvailableTranscript).not.toHaveBeenCalled();
  });
});
