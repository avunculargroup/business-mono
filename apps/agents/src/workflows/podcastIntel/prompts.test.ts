import { describe, it, expect } from 'vitest';
import {
  prepareTranscript,
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

  it('instructs descriptive, non-advice framing', () => {
    const p = buildSummaryPrompt(episode, 'body');
    expect(p).toMatch(/describe, never advise/i);
    expect(p).toMatch(/never/i);
  });
});

describe('buildSummaryLexPrompt', () => {
  it('carries the episode title and summary for review', () => {
    const p = buildSummaryLexPrompt({ title: 'Ep 1', description: null }, 'The host argued X.');
    expect(p).toContain('Ep 1');
    expect(p).toContain('The host argued X.');
    expect(p).toMatch(/advice risk/i);
  });
});
