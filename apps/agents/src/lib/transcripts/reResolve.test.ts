import { describe, it, expect, vi } from 'vitest';

// reResolve → resolveTranscript → deepgram tool, which constructs a Deepgram
// client at module load and throws without an API key. Mock it (these tests
// only exercise the pure parseEpisodeAction).
vi.mock('../../tools/deepgram.js', () => ({ deepgramTranscribe: { execute: vi.fn() } }));

const { parseEpisodeAction } = await import('./reResolve.js');

describe('parseEpisodeAction', () => {
  it('treats refetch and retry as a plain waterfall re-run (no forced Deepgram)', () => {
    expect(parseEpisodeAction('refetch')).toEqual({ forceDeepgram: false });
    expect(parseEpisodeAction('retry')).toEqual({ forceDeepgram: false });
  });

  it('forces Deepgram for the manual override action', () => {
    expect(parseEpisodeAction('deepgram')).toEqual({ forceDeepgram: true });
  });

  it('returns null for an unknown action', () => {
    expect(parseEpisodeAction('explode')).toBeNull();
    expect(parseEpisodeAction('')).toBeNull();
  });
});
