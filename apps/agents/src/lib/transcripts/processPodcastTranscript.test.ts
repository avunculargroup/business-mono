import { describe, it, expect, beforeEach, vi } from 'vitest';

const storeAvailableTranscript = vi.fn();
const updateEpisode = vi.fn().mockResolvedValue(undefined);
const upsertUtterances = vi.fn();
vi.mock('./store.js', () => ({
  storeAvailableTranscript: (...args: unknown[]) => storeAvailableTranscript(...args),
  updateEpisode: (...args: unknown[]) => updateEpisode(...args),
  upsertUtterances: (...args: unknown[]) => upsertUtterances(...args),
}));

const logActivityExecute = vi.fn();
vi.mock('../../tools/activity.js', () => ({
  logActivity: { execute: (...args: unknown[]) => logActivityExecute(...args) },
}));

const inferAndApplySpeakerNames = vi.fn();
vi.mock('./inferSpeakerNames.js', () => ({
  inferAndApplySpeakerNames: (...args: unknown[]) => inferAndApplySpeakerNames(...args),
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
    upsertUtterances.mockReset().mockResolvedValue(undefined);
    inferAndApplySpeakerNames.mockReset().mockResolvedValue({ renamed: 0, map: {} });
  });

  it('relabels the stored transcript text and segments with inferred names', async () => {
    // The helper renames segments in place; processPodcastTranscript builds the
    // flat text and embeds the segments AFTER it runs, so both pick up the name.
    inferAndApplySpeakerNames.mockImplementation((_id: string, segments: Array<{ speaker: string | null }>) => {
      for (const s of segments) if (s.speaker === 'Speaker 0') s.speaker = 'Obi-Wan';
      return Promise.resolve({ renamed: 1, map: { 'Speaker 0': 'Obi-Wan' } });
    });

    await processPodcastTranscript('ep-1', results);

    const stored = storeAvailableTranscript.mock.calls[0][1] as {
      text: string;
      segments: Array<{ speaker: string | null }>;
    };
    expect(stored.text).toContain('[Obi-Wan] Hello there');
    expect(stored.segments[0].speaker).toBe('Obi-Wan');
  });

  it('keeps generic labels and still stores when speaker inference throws', async () => {
    inferAndApplySpeakerNames.mockRejectedValue(new Error('model unavailable'));

    await expect(processPodcastTranscript('ep-1', results)).resolves.toBeUndefined();

    expect(storeAvailableTranscript).toHaveBeenCalledTimes(1);
    const stored = storeAvailableTranscript.mock.calls[0][1] as { text: string };
    expect(stored.text).toContain('[Speaker 0] Hello there');
    // A best-effort naming failure must not demote the transcript to 'failed'.
    expect(updateEpisode).not.toHaveBeenCalled();
  });

  it('persists utterances with the raw label, the resolved name and the map', async () => {
    inferAndApplySpeakerNames.mockImplementation((_id: string, segments: Array<{ speaker: string | null }>) => {
      for (const s of segments) if (s.speaker === 'Speaker 0') s.speaker = 'Obi-Wan';
      return Promise.resolve({ renamed: 1, map: { 'Speaker 0': 'Obi-Wan' } });
    });

    await processPodcastTranscript('ep-1', results);

    expect(upsertUtterances).toHaveBeenCalledWith('ep-1', {
      timing: 'deepgram',
      utterances: [
        { start: 0, end: 1, label: 'Speaker 0', speaker: 'Obi-Wan', text: 'Hello there' },
        { start: 1, end: 2, label: 'Speaker 1', speaker: 'Speaker 1', text: 'General Kenobi' },
      ],
      speakerMap: { 'Speaker 0': 'Obi-Wan' },
    });
  });

  it('does NOT demote a stored transcript when the utterance write throws', async () => {
    upsertUtterances.mockRejectedValue(new Error('relation does not exist'));

    await expect(processPodcastTranscript('ep-1', results)).resolves.toBeUndefined();

    expect(storeAvailableTranscript).toHaveBeenCalledTimes(1);
    expect(updateEpisode).not.toHaveBeenCalled();
    expect(logActivityExecute).toHaveBeenCalledTimes(1);
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
