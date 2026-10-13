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

  it('nulls the speaker when no one owns 75% of a mixed window', () => {
    const timed: TimedSegment[] = [
      { start: 0, end: 2, speaker: 'A', text: 'hi' },
      { start: 2, end: 4, speaker: 'B', text: 'yo' },
    ];
    expect(buildSegments(timed, 'hi yo')[0]).toMatchObject({
      speaker: null,
      speakers: ['A', 'B'],
      content: '[A] hi\n[B] yo',
    });
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

// A string of exactly n chars, distinguishable per call so contents can be traced.
const chars = (n: number, ch = 'x') => ch.repeat(n);
const utt = (i: number, speaker: string | null, text: string): TimedSegment => ({
  start: i * 10,
  end: i * 10 + 10,
  speaker,
  text,
});

describe('buildSegments — turn-aware windows', () => {
  it('packs a monologue into single-speaker windows with no markers', () => {
    const timed = Array.from({ length: 12 }, (_, i) => utt(i, 'Jeff', chars(500)));
    const drafts = buildSegments(timed, '');
    expect(drafts.length).toBeGreaterThan(1);
    for (const d of drafts) {
      expect(d).toMatchObject({ speaker: 'Jeff', speakers: ['Jeff'] });
      expect(d.content).not.toContain('[');
    }
  });

  it('breaks on each turn of a two-speaker interview with long turns', () => {
    const timed = [utt(0, 'Host', chars(700, 'h')), utt(1, 'Guest', chars(700, 'g')), utt(2, 'Host', chars(700, 'k'))];
    const drafts = buildSegments(timed, '');
    expect(drafts.map((d) => d.speaker)).toEqual(['Host', 'Guest', 'Host']);
    expect(drafts.map((d) => d.speakers)).toEqual([['Host'], ['Guest'], ['Host']]);
    expect(drafts.map((d) => [d.startSeconds, d.endSeconds])).toEqual([[0, 10], [10, 20], [20, 30]]);
    expect(drafts.map((d) => d.segmentIndex)).toEqual([0, 1, 2]);
  });

  it('absorbs a short interjection with inline markers and keeps the primary speaker', () => {
    const timed = [utt(0, 'Host', chars(300, 'a')), utt(1, 'Guest', 'Yeah.'), utt(2, 'Host', chars(300, 'b'))];
    const [d, ...rest] = buildSegments(timed, '');
    expect(rest).toHaveLength(0);
    expect(d).toMatchObject({
      speaker: 'Host',
      speakers: ['Host', 'Guest'],
      content: `[Host] ${chars(300, 'a')}\n[Guest] Yeah.\n[Host] ${chars(300, 'b')}`,
      startSeconds: 0,
      endSeconds: 30,
    });
  });

  it('joins a same-speaker run with spaces inside a mixed window', () => {
    const timed = [utt(0, 'A', 'one'), utt(1, 'A', 'two'), utt(2, 'B', 'three')];
    expect(buildSegments(timed, '')[0]!.content).toBe('[A] one two\n[B] three');
  });

  it('splits a turn over 2400 chars into single-speaker windows', () => {
    const timed = [
      utt(0, 'Host', chars(700, 'q')),
      ...Array.from({ length: 8 }, (_, i) => utt(i + 1, 'Guest', chars(500, 'g'))),
    ];
    const drafts = buildSegments(timed, '');
    const guest = drafts.slice(1);
    expect(guest.length).toBeGreaterThan(1);
    for (const d of guest) {
      expect(d).toMatchObject({ speaker: 'Guest', speakers: ['Guest'] });
      expect(d.content.length).toBeLessThanOrEqual(2400);
    }
  });

  it('gives speaker at exactly 75% of characters and null just below', () => {
    const at = buildSegments([utt(0, 'A', chars(300)), utt(1, 'B', chars(100))], '')[0]!;
    expect(at.speaker).toBe('A');
    const below = buildSegments([utt(0, 'A', chars(299)), utt(1, 'B', chars(101))], '')[0]!;
    expect(below.speaker).toBeNull();
  });

  it('never lists or marks a null-speaker utterance in a diarised window', () => {
    const timed = [utt(0, 'A', 'alpha'), utt(1, null, 'music'), utt(2, 'B', 'beta')];
    expect(buildSegments(timed, '')[0]).toMatchObject({
      speakers: ['A', 'B'],
      content: '[A] alpha\nmusic\n[B] beta',
    });
  });

  it('matches the previous greedy packing exactly when no speakers are present', () => {
    // The pre-turn-aware algorithm, verbatim, as the reference.
    const legacy = (timed: TimedSegment[]) => {
      const out: { start: number | null; end: number | null; content: string }[] = [];
      let buf: TimedSegment[] = [];
      let len = 0;
      const flush = () => {
        if (!buf.length) return;
        out.push({
          start: buf[0]!.start,
          end: buf[buf.length - 1]!.end ?? buf[buf.length - 1]!.start,
          content: buf.map((s) => s.text).join(' ').trim(),
        });
        buf = [];
        len = 0;
      };
      for (const seg of timed) {
        const text = seg.text.trim();
        if (!text) continue;
        if (len > 0 && len + text.length > 2400) flush();
        buf.push(seg);
        len += text.length + 1;
      }
      flush();
      return out;
    };
    const sizes = [40, 900, 1700, 12, 0, 650, 2600, 300, 300, 300, 1999, 5];
    const timed = sizes.map((n, i) => utt(i, null, chars(n, String.fromCharCode(97 + i))));

    const drafts = buildSegments(timed, '');
    expect(drafts.map((d) => ({ start: d.startSeconds, end: d.endSeconds, content: d.content }))).toEqual(
      legacy(timed),
    );
    for (const d of drafts) expect(d).toMatchObject({ speaker: null, speakers: [] });
  });
});

describe('embedEpisodeSegments', () => {
  const drafts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      segmentIndex: i,
      startSeconds: i,
      endSeconds: i + 1,
      speaker: null,
      speakers: [],
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
