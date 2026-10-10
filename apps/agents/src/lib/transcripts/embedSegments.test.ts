import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '../../../test/mocks/supabase.js';
import type { TimedSegment } from './parsers.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));
vi.mock('../contentEmbeddings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contentEmbeddings.js')>()),
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2])),
}));

const { buildSegments, embedEpisodeSegments } = await import('./embedSegments.js');

describe('buildSegments', () => {
  it('preserves first-start / last-end across a packed window', () => {
    // Short segments that all fit in one ~600-token window.
    const timed: TimedSegment[] = [
      { start: 0, end: 2, speaker: 'A', text: 'one' },
      { start: 2, end: 4, speaker: 'A', text: 'two' },
      { start: 4, end: 6, speaker: 'A', text: 'three' },
    ];
    const drafts = buildSegments(timed, 'one two three');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      segmentIndex: 0,
      startSeconds: 0,
      endSeconds: 6,
      speaker: 'A',
      content: 'one two three',
    });
  });

  it('nulls the speaker when a window mixes speakers', () => {
    const timed: TimedSegment[] = [
      { start: 0, end: 2, speaker: 'A', text: 'hi' },
      { start: 2, end: 4, speaker: 'B', text: 'yo' },
    ];
    expect(buildSegments(timed, 'hi yo')[0]!.speaker).toBeNull();
  });

  it('splits into multiple windows when content exceeds the target', () => {
    const big = 'word '.repeat(700).trim(); // ~3500 chars > 2400-char window
    const timed: TimedSegment[] = [
      { start: 0, end: 100, speaker: null, text: big },
      { start: 100, end: 200, speaker: null, text: big },
      { start: 200, end: 300, speaker: null, text: 'tail' },
    ];
    const drafts = buildSegments(timed, `${big} ${big} tail`);
    expect(drafts.length).toBeGreaterThan(1);
    // Indices are contiguous and start at 0.
    expect(drafts.map((d) => d.segmentIndex)).toEqual(drafts.map((_, i) => i));
    expect(drafts[0]!.startSeconds).toBe(0);
  });

  it('falls back to plain-text chunking with null timestamps when untimed', () => {
    const drafts = buildSegments(null, 'plain transcript text');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ startSeconds: null, endSeconds: null, speaker: null });
    expect(drafts[0]!.content).toBe('plain transcript text');
  });

  it('treats a timed list with no real timestamps as plain text', () => {
    const timed: TimedSegment[] = [{ start: null, end: null, speaker: null, text: 'no times here' }];
    const drafts = buildSegments(timed, 'no times here');
    expect(drafts[0]!.startSeconds).toBeNull();
  });
});

describe('embedEpisodeSegments', () => {
  const drafts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      segmentIndex: i,
      startSeconds: i,
      endSeconds: i + 1,
      speaker: null,
      content: `segment ${i}`,
      tokenCount: 3,
    }));

  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__setResponse('transcript_segments', { data: null, error: null });
  });

  it('inserts in batches of 25 so a long episode never sends one huge statement', async () => {
    await expect(embedEpisodeSegments('ep-1', drafts(60))).resolves.toEqual({ segments: 60 });

    const inserts = fake
      .__buildersFor('transcript_segments')
      .filter((b) => b.insert.mock.calls.length > 0)
      .map((b) => (b.insert.mock.calls[0]![0] as unknown[]).length);
    expect(inserts).toEqual([25, 25, 10]);
  });

  it('clears prior rows before inserting', async () => {
    await embedEpisodeSegments('ep-1', drafts(3));
    const [first] = fake.__buildersFor('transcript_segments');
    expect(first!.delete).toHaveBeenCalled();
    expect(first!.eq).toHaveBeenCalledWith('episode_id', 'ep-1');
  });

  it('throws on a failed batch and stops inserting', async () => {
    fake.__setResponses('transcript_segments', [
      { data: null, error: null }, // delete
      { data: null, error: null }, // batch 1
      { data: null, error: { message: 'canceling statement due to statement timeout' } },
    ]);
    await expect(embedEpisodeSegments('ep-1', drafts(60))).rejects.toThrow(
      'transcript_segments insert failed: canceling statement due to statement timeout',
    );
    const inserts = fake.__buildersFor('transcript_segments').filter((b) => b.insert.mock.calls.length > 0);
    expect(inserts).toHaveLength(2);
  });
});
