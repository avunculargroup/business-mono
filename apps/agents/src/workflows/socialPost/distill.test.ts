import { describe, it, expect } from 'vitest';
import { buildDistillPrompt, normalizeGuidelines, MAX_GUIDELINES } from './distill.js';

describe('buildDistillPrompt', () => {
  it('carries the account, current guidelines, and feedback notes', () => {
    const prompt = buildDistillPrompt({
      accountLabel: 'Chris Pollard',
      platform: 'linkedin',
      currentGuidelines: ['Never open with a rhetorical question.'],
      feedbackItems: [
        {
          verdict: 'negative',
          feedback: 'Too preachy — drop the closing lesson.',
          post_form: 'teach',
          draft_excerpt: 'Here is what every CFO should learn…',
        },
      ],
    });

    expect(prompt).toContain("Chris Pollard's linkedin posts");
    expect(prompt).toContain('- Never open with a rhetorical question.');
    expect(prompt).toContain('[negative]');
    expect(prompt).toContain('(form: teach)');
    expect(prompt).toContain('Too preachy — drop the closing lesson.');
    expect(prompt).toContain('Here is what every CFO should learn…');
    expect(prompt).toContain('Return the FULL revised list');
  });

  it('renders an empty current list and omits absent optional fields', () => {
    const prompt = buildDistillPrompt({
      accountLabel: 'Chris',
      platform: 'twitter_x',
      currentGuidelines: [],
      feedbackItems: [{ verdict: null, feedback: 'More like this.', post_form: null, draft_excerpt: null }],
    });

    expect(prompt).toContain('(none yet)');
    expect(prompt).toContain('1. More like this.');
    expect(prompt).not.toContain('[');
    expect(prompt).not.toContain('(form:');
  });
});

describe('normalizeGuidelines', () => {
  it('trims, collapses whitespace, and drops empties and non-strings', () => {
    expect(normalizeGuidelines(['  Keep it  short. ', '', 42, null, 'Hold a view.'])).toEqual([
      'Keep it short.',
      'Hold a view.',
    ]);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    expect(normalizeGuidelines(['Keep it short.', 'keep it short.'])).toEqual(['Keep it short.']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_GUIDELINES + 5 }, (_, i) => `Rule ${i}.`);
    expect(normalizeGuidelines(many)).toHaveLength(MAX_GUIDELINES);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeGuidelines(null)).toEqual([]);
    expect(normalizeGuidelines('rule')).toEqual([]);
    expect(normalizeGuidelines({ guidelines: [] })).toEqual([]);
  });
});
