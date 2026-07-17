import { describe, it, expect } from 'vitest';
import { toGuidelines, buildGuidelinesBlock } from './guidelines.js';

describe('toGuidelines', () => {
  it('parses a clean JSONB array', () => {
    expect(toGuidelines(['Keep it short.', 'Hold a view.'])).toEqual(['Keep it short.', 'Hold a view.']);
  });

  it('degrades bad data to an empty list', () => {
    expect(toGuidelines(null)).toEqual([]);
    expect(toGuidelines('not an array')).toEqual([]);
    expect(toGuidelines([1, '', '  Ok.  '])).toEqual(['Ok.']);
  });
});

describe('buildGuidelinesBlock', () => {
  it('is empty when there are no guidelines', () => {
    expect(buildGuidelinesBlock([])).toBe('');
  });

  it('renders the standing-feedback block with one bullet per guideline', () => {
    const block = buildGuidelinesBlock(['Never open with a question.', 'Skip hashtags.']);
    expect(block).toContain('## Standing feedback from the founder');
    expect(block).toContain('- Never open with a question.');
    expect(block).toContain('- Skip hashtags.');
  });
});
