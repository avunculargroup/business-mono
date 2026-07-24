import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../../../test/mocks/supabase.js';
import type { TimedSegment } from './parsers.js';

const fakeSupabase = createFakeSupabase();
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const rogerGenerate = vi.fn();
vi.mock('../../agents/recorder/agent.js', () => ({
  roger: { generate: (...args: unknown[]) => rogerGenerate(...(args as [])) },
}));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn((scope: string) => ({ scope })),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { buildSpeakerPrompt, applySpeakerNames, inferAndApplySpeakerNames } = await import(
  './inferSpeakerNames.js'
);

function seg(speaker: string | null, text: string): TimedSegment {
  return { start: 0, end: 1, speaker, text };
}

beforeEach(() => {
  rogerGenerate.mockReset();
  fakeSupabase.__setResponse('podcast_episodes', {
    data: { title: 'The Show', description: 'Host Jane interviews Bob.' },
    error: null,
  });
});

describe('buildSpeakerPrompt', () => {
  it('includes the title, description and transcript sample', () => {
    const prompt = buildSpeakerPrompt(
      { title: 'My Show', description: 'Jane and Bob talk sats.' },
      '[Speaker 0] hello',
    );
    expect(prompt).toContain('My Show');
    expect(prompt).toContain('Jane and Bob talk sats.');
    expect(prompt).toContain('[Speaker 0] hello');
  });

  it('renders a null description as (none)', () => {
    expect(buildSpeakerPrompt({ title: 'X', description: null }, 'body')).toContain('(none)');
  });
});

describe('applySpeakerNames', () => {
  it('renames matching labels in place and leaves the rest', () => {
    const segs = [seg('Speaker 0', 'a'), seg('Speaker 1', 'b'), seg('Speaker 0', 'c')];
    const renamed = applySpeakerNames(segs, { 'Speaker 0': 'Jane' });
    expect(renamed).toBe(2);
    expect(segs.map((s) => s.speaker)).toEqual(['Jane', 'Speaker 1', 'Jane']);
  });

  it('is a no-op with an empty map', () => {
    const segs = [seg('Speaker 0', 'a')];
    expect(applySpeakerNames(segs, {})).toBe(0);
    expect(segs[0]!.speaker).toBe('Speaker 0');
  });
});

describe('inferAndApplySpeakerNames', () => {
  it('applies confident names and leaves low-confidence labels generic', async () => {
    rogerGenerate.mockResolvedValueOnce({
      object: {
        speakers: [
          { label: 'Speaker 0', name: 'Jane Doe', confidence: 0.9 },
          { label: 'Speaker 1', name: 'Bob', confidence: 0.3 },
        ],
      },
    });
    const segs = [seg('Speaker 0', 'hi'), seg('Speaker 1', 'yo')];

    const renamed = await inferAndApplySpeakerNames('ep-1', segs);

    expect(renamed).toBe(1);
    expect(segs[0]!.speaker).toBe('Jane Doe');
    expect(segs[1]!.speaker).toBe('Speaker 1');
  });

  it('ignores names for labels that are not in the transcript', async () => {
    rogerGenerate.mockResolvedValueOnce({
      object: { speakers: [{ label: 'Speaker 5', name: 'Ghost', confidence: 0.99 }] },
    });
    const segs = [seg('Speaker 0', 'hi')];

    expect(await inferAndApplySpeakerNames('ep-1', segs)).toBe(0);
    expect(segs[0]!.speaker).toBe('Speaker 0');
  });

  it('returns 0 without calling the model when no segments carry a speaker', async () => {
    const segs = [seg(null, 'plain text')];

    expect(await inferAndApplySpeakerNames('ep-1', segs)).toBe(0);
    expect(rogerGenerate).not.toHaveBeenCalled();
  });

  it('runs under the identify_speakers step scope', async () => {
    rogerGenerate.mockResolvedValueOnce({ object: { speakers: [] } });

    await inferAndApplySpeakerNames('ep-1', [seg('Speaker 0', 'hi')]);

    const opts = rogerGenerate.mock.calls[0]![1] as { requestContext: { scope: string } };
    expect(opts.requestContext.scope).toBe('podcast_transcript.identify_speakers');
  });
});
