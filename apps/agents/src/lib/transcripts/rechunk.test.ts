import { describe, it, expect } from 'vitest';
import { alignUtterances, nullSpeakerPct, parseTranscriptLines } from './rechunk.js';

const text = ['[Jeff] Hello and welcome.', '[Lance] Thanks for having me.', 'ad read', '[Jeff] Let us start.'].join(
  '\n',
);

describe('parseTranscriptLines', () => {
  it('reads [Name] markers and treats unmarked lines as null-speaker', () => {
    expect(parseTranscriptLines(text)).toEqual([
      { speaker: 'Jeff', text: 'Hello and welcome.' },
      { speaker: 'Lance', text: 'Thanks for having me.' },
      { speaker: null, text: 'ad read' },
      { speaker: 'Jeff', text: 'Let us start.' },
    ]);
  });
});

describe('alignUtterances', () => {
  const lines = parseTranscriptLines(text);
  const segments = [
    { start_seconds: 0, end_seconds: 100, content: 'Hello and welcome. Thanks for having me.' },
    { start_seconds: 100, end_seconds: 130, content: 'ad read Let us start.' },
  ];

  it('aligns lines to segments on an exact match and pins segment boundaries', () => {
    const r = alignUtterances(lines, segments);
    if (!r.ok) throw new Error(r.reason);
    expect(r.utterances.map((u) => [u.speaker, u.text])).toEqual(lines.map((l) => [l.speaker, l.text]));
    expect(r.utterances[0]).toMatchObject({ start: 0, label: 'Jeff' });
    // Utterance 2 starts 19 chars into a 40-char, 100-second segment.
    expect(r.utterances[1]!.start).toBeCloseTo(47.5);
    expect(r.utterances[1]!.end).toBe(100);
    expect(r.utterances[2]!.start).toBe(100);
    expect(r.utterances[3]!.end).toBe(130);
  });

  it('interpolates monotonically, each end meeting the next start', () => {
    const r = alignUtterances(lines, segments);
    if (!r.ok) throw new Error(r.reason);
    for (let i = 0; i < r.utterances.length; i++) {
      const u = r.utterances[i]!;
      expect(u.end!).toBeGreaterThan(u.start!);
      if (i > 0) expect(u.start).toBe(r.utterances[i - 1]!.end);
    }
  });

  it('skips the episode when a segment does not match its lines exactly', () => {
    const bad = [{ ...segments[0]!, content: 'Hello and welcome. Thanks for having us.' }, segments[1]!];
    expect(alignUtterances(lines, bad)).toEqual({ ok: false, reason: 'segment 0 content mismatch' });
  });

  it('skips the episode when a segment boundary falls inside a line', () => {
    const bad = [{ ...segments[0]!, content: 'Hello and' }, segments[1]!];
    expect(alignUtterances(lines, bad).ok).toBe(false);
  });

  it('skips the episode when lines are left after the last segment', () => {
    expect(alignUtterances(lines, segments.slice(0, 1))).toEqual({
      ok: false,
      reason: '2 lines left after the last segment',
    });
  });
});

describe('nullSpeakerPct', () => {
  it('rounds to one decimal and handles no segments', () => {
    expect(nullSpeakerPct([{ speaker: null }, { speaker: 'A' }, { speaker: 'A' }])).toBe(33.3);
    expect(nullSpeakerPct([])).toBe(0);
  });
});
