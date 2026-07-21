import { describe, it, expect } from 'vitest';
import type { TranscriptVectorSearchResult } from '@platform/db';
import {
  formatStamp,
  truncateQuote,
  buildSourcesBlock,
  resolveCitations,
  buildAnswerPrompt,
  buildAnswerLexPrompt,
  MAX_QUOTE_CHARS,
} from './prompts.js';

function hit(overrides: Partial<TranscriptVectorSearchResult> = {}): TranscriptVectorSearchResult {
  return {
    segment_id: 'seg',
    episode_id: 'ep-1',
    episode_title: 'Custody in 2026',
    source_name: 'Sound Money',
    start_seconds: 90,
    end_seconds: 120,
    speaker: 'GUEST',
    content: 'Multisig custody is a board-level decision.',
    youtube_url: null,
    audio_url: null,
    curator_note: null,
    published_at: null,
    similarity: 0.7,
    ...overrides,
  };
}

describe('formatStamp', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatStamp(90)).toBe('1:30');
    expect(formatStamp(3661)).toBe('1:01:01');
    expect(formatStamp(null)).toBe('—');
  });
});

describe('truncateQuote', () => {
  it('trims and appends an ellipsis past the cap', () => {
    const long = 'a'.repeat(MAX_QUOTE_CHARS + 50);
    const out = truncateQuote(long);
    expect(out.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves a short quote untouched', () => {
    expect(truncateQuote('  short  ')).toBe('short');
  });
});

describe('buildSourcesBlock', () => {
  it('numbers sources with title, timestamp, and quote', () => {
    const block = buildSourcesBlock([hit(), hit({ episode_title: 'Macro Hour', start_seconds: 600 })]);
    expect(block).toContain('[1] Custody in 2026 @ 1:30');
    expect(block).toContain('[2] Macro Hour @ 10:00');
    expect(block).toContain('Multisig custody is a board-level decision.');
  });
});

describe('resolveCitations', () => {
  const results = [hit({ episode_id: 'a' }), hit({ episode_id: 'b' }), hit({ episode_id: 'c' })];

  it('maps 1-based source numbers to citations, deduped and order-preserved', () => {
    const cites = resolveCitations([2, 1, 2], results);
    expect(cites.map((c) => c.episode_id)).toEqual(['b', 'a']);
    expect(cites[0]).toMatchObject({ episode_id: 'b', start_seconds: 90 });
  });

  it('drops out-of-range indices so a citation always points at a real segment', () => {
    expect(resolveCitations([9, 0, 1], results).map((c) => c.episode_id)).toEqual(['a']);
  });

  it('returns nothing when no sources were cited', () => {
    expect(resolveCitations([], results)).toEqual([]);
  });
});

describe('buildAnswerPrompt', () => {
  it('carries the question, the sources, and grounding/advice rules', () => {
    const p = buildAnswerPrompt('How are firms accounting for bitcoin?', '[1] Source');
    expect(p).toContain('How are firms accounting for bitcoin?');
    expect(p).toContain('[1] Source');
    expect(p).toMatch(/ground everything in the excerpts/i);
    expect(p).toMatch(/describe, never advise/i);
    expect(p).toMatch(/cited_sources/);
  });
});

describe('buildAnswerLexPrompt', () => {
  it('carries the question and answer for review', () => {
    const p = buildAnswerLexPrompt('Q?', 'The guests discussed custody.');
    expect(p).toContain('Q?');
    expect(p).toContain('The guests discussed custody.');
    expect(p).toMatch(/advice risk/i);
  });
});
