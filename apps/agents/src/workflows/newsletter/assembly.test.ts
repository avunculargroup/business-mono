import { describe, it, expect } from 'vitest';
import {
  countWords,
  resolvePlaceholders,
  overLengthStoryIds,
  assembleNewsletter,
} from './assembly.js';
import type { ReviewedStory } from './schemas.js';

function story(id: string, words: number): ReviewedStory {
  return {
    story_id: id,
    title: `Story ${id}`,
    body: Array.from({ length: words }, (_, i) => `word${i}`).join(' '),
    word_count: words,
    review: {
      story_id: id,
      scores: {
        voice_match: 8,
        audience_fit: 8,
        bitcoin_accuracy: 9,
        clarity: 8,
        evidence_quality: 7,
        length_discipline: 8,
      },
      overall_score: 8,
      passes_gate: true,
      critique: '',
      editor_note: '',
    },
  };
}

describe('countWords', () => {
  it('counts whitespace-delimited words and ignores markdown markers', () => {
    expect(countWords('## A confident **headline** here')).toBe(4);
  });
  it('returns 0 for empty', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('resolvePlaceholders', () => {
  const vars = { abn: '12 345 678 901', website: 'bts.example', legal_name: 'BTS Pty Ltd' };

  it('resolves known keys', () => {
    expect(resolvePlaceholders('ABN {{abn}}', vars)).toBe('ABN 12 345 678 901');
  });
  it('supports spec aliases', () => {
    expect(resolvePlaceholders('{{bts_abn}} / {{public_website}}', vars)).toBe(
      '12 345 678 901 / bts.example',
    );
  });
  it('strips unknown placeholders rather than leaking braces', () => {
    expect(resolvePlaceholders('x {{missing}} y', vars)).toBe('x  y');
  });
});

describe('overLengthStoryIds', () => {
  it('flags stories more than 30% over target', () => {
    const stories = [story('a', 250), story('b', 326), story('c', 320)];
    expect(overLengthStoryIds(stories, 250)).toEqual(['b']);
  });
});

describe('assembleNewsletter', () => {
  it('produces a structured newsletter with intro, stories, outro and footer', () => {
    const md = assembleNewsletter({
      title: 'BTS Newsletter — May 2026',
      date: new Date('2026-05-31T00:00:00Z'),
      intro: 'Welcome.',
      outro: 'Until next time.',
      stories: [story('a', 10), story('b', 10)],
      company: { trading_name: 'BTS', abn: '123', website: 'bts.example', tagline: 'Sound money.' },
    });
    expect(md).toContain('# BTS Newsletter — May 2026');
    expect(md).toContain('## From the team');
    expect(md).toContain('## Story a');
    expect(md).toContain('## Story b');
    expect(md).toContain("That's it for this issue");
    expect(md).toContain('ABN 123 | bts.example');
    expect(md).toContain('*Sound money.*');
    // No unresolved placeholders.
    expect(md).not.toMatch(/\{\{.*\}\}/);
  });
});
