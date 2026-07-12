import { describe, it, expect } from 'vitest';
import {
  toRecentPosts,
  extractOpeningLines,
  buildRepetitionBlock,
  recentForms,
  type RecentPost,
} from './history.js';

function post(overrides: Partial<RecentPost>): RecentPost {
  return { title: null, body: null, is_thread: false, post_form: null, created_at: '2026-07-10T00:00:00Z', ...overrides };
}

describe('toRecentPosts', () => {
  it('returns [] for null / non-array input', () => {
    expect(toRecentPosts(null)).toEqual([]);
    expect(toRecentPosts(undefined)).toEqual([]);
    expect(toRecentPosts({ id: 'x' })).toEqual([]);
  });

  it('maps rows tolerating missing fields', () => {
    const rows = [{ title: 'T', body: 'B', is_thread: 1, post_form: 'teach', created_at: 'c' }, {}];
    const out = toRecentPosts(rows);
    expect(out[0]).toEqual({ title: 'T', body: 'B', is_thread: true, post_form: 'teach', created_at: 'c' });
    expect(out[1]).toEqual({ title: null, body: null, is_thread: false, post_form: null, created_at: '' });
  });
});

describe('extractOpeningLines', () => {
  it('takes the first non-empty body line, collapsed and trimmed', () => {
    const out = extractOpeningLines([post({ body: '  The RBA held rates today.\nMore below.' })]);
    expect(out).toEqual(['The RBA held rates today.']);
  });

  it('uses the thread lead in body for a thread, and falls back to title when body is empty', () => {
    const out = extractOpeningLines([
      post({ is_thread: true, body: 'A quick thread on custody.' }),
      post({ body: '   ', title: 'Only the title' }),
    ]);
    expect(out).toEqual(['A quick thread on custody.', 'Only the title']);
  });

  it('dedupes case-insensitively and caps to max', () => {
    const posts = [
      post({ body: 'Same opener.' }),
      post({ body: 'same OPENER.' }),
      post({ body: 'Different one.' }),
    ];
    expect(extractOpeningLines(posts)).toEqual(['Same opener.', 'Different one.']);
    expect(extractOpeningLines(posts, 1)).toEqual(['Same opener.']);
  });

  it('skips posts with no usable opener', () => {
    expect(extractOpeningLines([post({ body: null, title: null })])).toEqual([]);
  });
});

describe('buildRepetitionBlock', () => {
  it('is empty when there are no openings', () => {
    expect(buildRepetitionBlock([])).toBe('');
  });

  it('lists the openers and tells Charlie not to reuse them', () => {
    const block = buildRepetitionBlock(['The RBA held rates.', 'Custody matters.']);
    expect(block).toContain('Do not repeat yourself');
    expect(block).toContain('- The RBA held rates.');
    expect(block).toContain('- Custody matters.');
  });
});

describe('recentForms', () => {
  it('returns known forms most-recent-first, unique, capped', () => {
    const posts = [
      post({ post_form: 'teach' }),
      post({ post_form: 'teach' }),
      post({ post_form: 'numbers_first' }),
      post({ post_form: 'share_with_context' }),
    ];
    expect(recentForms(posts)).toEqual(['teach', 'numbers_first', 'share_with_context']);
    expect(recentForms(posts, 2)).toEqual(['teach', 'numbers_first']);
  });

  it('ignores null and unknown post_form values', () => {
    const posts = [post({ post_form: null }), post({ post_form: 'not_a_form' }), post({ post_form: 'small_note' })];
    expect(recentForms(posts)).toEqual(['small_note']);
  });
});
