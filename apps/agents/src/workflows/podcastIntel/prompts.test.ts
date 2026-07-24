import { describe, it, expect } from 'vitest';
import {
  prepareTranscript,
  buildTimestampedTranscript,
  snapToSegment,
  buildSummaryPrompt,
  buildSummaryLexPrompt,
  MAX_TRANSCRIPT_CHARS,
} from './prompts.js';

describe('prepareTranscript', () => {
  it('returns a short transcript trimmed, untouched otherwise', () => {
    expect(prepareTranscript('  hello there  ')).toBe('hello there');
  });

  it('truncates an over-budget transcript and marks the cut', () => {
    const long = 'a'.repeat(MAX_TRANSCRIPT_CHARS + 500);
    const out = prepareTranscript(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain('[transcript truncated]');
    expect(out.startsWith('a'.repeat(100))).toBe(true);
  });

  it('honours a custom budget', () => {
    expect(prepareTranscript('abcdef', 3)).toBe('abc\n\n[transcript truncated]');
  });
});

describe('buildTimestampedTranscript', () => {
  it('prefixes each timestamped segment with a [Ns] marker and speaker', () => {
    const out = buildTimestampedTranscript([
      { start_seconds: 12.8, speaker: 'HOST', content: 'Welcome.' },
      { start_seconds: 90, speaker: null, content: 'Custody matters.' },
    ]);
    expect(out).toBe('[12s] HOST: Welcome.\n\n[90s] Custody matters.');
  });

  it('omits the marker when a segment has no start', () => {
    const out = buildTimestampedTranscript([{ start_seconds: null, speaker: null, content: 'No stamp.' }]);
    expect(out).toBe('No stamp.');
  });
});

describe('snapToSegment', () => {
  const starts = [0, 30, 90, 150];

  it('snaps a proposed second to the nearest real segment start', () => {
    expect(snapToSegment(88, starts)).toBe(90);
    expect(snapToSegment(20, starts)).toBe(30);
    expect(snapToSegment(0, starts)).toBe(0);
  });

  it('returns null when there is nothing to snap to', () => {
    expect(snapToSegment(42, [])).toBeNull();
  });

  it('returns null when there is no proposal', () => {
    expect(snapToSegment(null, starts)).toBeNull();
  });
});

describe('buildSummaryPrompt', () => {
  const episode = { title: 'Custody in 2026', description: 'A chat about cold storage.' };

  it('includes the title, show notes and transcript', () => {
    const p = buildSummaryPrompt(episode, 'GUEST: multisig matters.');
    expect(p).toContain('Custody in 2026');
    expect(p).toContain('A chat about cold storage.');
    expect(p).toContain('GUEST: multisig matters.');
  });

  it('omits the show-notes line when there is no description', () => {
    const p = buildSummaryPrompt({ title: 'T', description: null }, 'body');
    expect(p).not.toContain('SHOW NOTES:');
  });

  it('asks for takeaways anchored to timestamp markers', () => {
    const p = buildSummaryPrompt(episode, 'body');
    expect(p).toMatch(/takeaways/i);
    expect(p).toMatch(/start_seconds/);
    expect(p).toContain('[<seconds>s]');
  });

  it('asks for chapters in chronological order', () => {
    const p = buildSummaryPrompt(episode, 'body');
    expect(p).toMatch(/chapters/i);
    expect(p).toMatch(/chronological/i);
  });

  it('instructs descriptive, non-advice framing', () => {
    const p = buildSummaryPrompt(episode, 'body');
    expect(p).toMatch(/describe, never advise/i);
    expect(p).toMatch(/never/i);
  });

  it('asks for lowercase hyphenated topic tags', () => {
    const p = buildSummaryPrompt(episode, 'body');
    expect(p).toMatch(/topic_tags/i);
    expect(p).toMatch(/lowercase, hyphenated/i);
  });
});

describe('buildSummaryLexPrompt', () => {
  it('carries the episode title, summary, and takeaways for review', () => {
    const p = buildSummaryLexPrompt({ title: 'Ep 1', description: null }, 'The host argued X.', [
      'Custody is a board decision.',
    ]);
    expect(p).toContain('Ep 1');
    expect(p).toContain('The host argued X.');
    expect(p).toContain('Custody is a board decision.');
    expect(p).toMatch(/advice risk/i);
  });

  it('omits the takeaways block when there are none', () => {
    const p = buildSummaryLexPrompt({ title: 'Ep 1', description: null }, 'The host argued X.', []);
    expect(p).not.toContain('TAKEAWAYS:');
  });
});
