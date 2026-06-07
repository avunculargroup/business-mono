import { describe, it, expect } from 'vitest';
import { buildSegments } from './embedSegments.js';
import type { TimedSegment } from './parsers.js';

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
