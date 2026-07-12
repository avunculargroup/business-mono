import { describe, it, expect } from 'vitest';
import { buildSocialPostRow, buildThreadSegmentRows, type DisclaimerRef } from './persist.js';
import type { CharlieVariant, LexVerdict } from '../variant/schemas.js';

const DISCLAIMERS: DisclaimerRef[] = [
  { id: 'snip-ga', key: 'general_advice_warning' },
  { id: 'snip-np', key: 'no_personal_advice' },
];

const SINGLE: CharlieVariant = {
  is_thread: false,
  title: 'Holding the line',
  body: 'The RBA held rates. Here is what it means for your treasury horizon.',
  segments: [],
  charlie_note: '',
};

const THREAD: CharlieVariant = {
  is_thread: true,
  title: '',
  body: 'A short thread on rate decisions',
  segments: [{ body: 'First point.' }, { body: 'Second point.' }],
  charlie_note: '',
};

const CLEARED: LexVerdict = { classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'edu' };
const ADVICE: LexVerdict = {
  classification: 'general_advice',
  needs_disclaimer: true,
  disclaimer_key: 'general_advice_warning',
  rationale: 'touches allocation',
};

describe('buildSocialPostRow', () => {
  it('builds a campaign-less draft row tied only to the founder account', () => {
    const row = buildSocialPostRow({
      platform: 'linkedin',
      socialAccountId: 'acc-1',
      form: 'flat_observation',
      draft: SINGLE,
      verdict: CLEARED,
      disclaimerSnippets: DISCLAIMERS,
      checkedAt: '2026-06-26T09:00:00Z',
    });
    expect(row.campaign_id).toBeNull();
    expect(row.beat_id).toBeNull();
    expect(row.social_account_id).toBe('acc-1');
    expect(row.post_form).toBe('flat_observation');
    expect(row.type).toBe('linkedin');
    expect(row.status).toBe('draft');
    expect(row.source).toBe('charlie');
    expect(row.is_thread).toBe(false);
    expect(row.char_count).toBe(Array.from(SINGLE.body).length);
    expect(row.compliance_status).toBe('cleared');
    expect(row.needs_disclaimer).toBe(false);
    expect(row.disclaimer_snippet_id).toBeNull();
  });

  it('flags personal opinion and resolves a disclaimer snippet id for general advice', () => {
    const row = buildSocialPostRow({
      platform: 'twitter_x',
      socialAccountId: 'acc-2',
      form: 'teach',
      draft: THREAD,
      verdict: ADVICE,
      disclaimerSnippets: DISCLAIMERS,
      checkedAt: '2026-06-26T09:00:00Z',
    });
    expect(row.post_form).toBe('teach');
    expect(row.is_thread).toBe(true);
    expect(row.char_count).toBeNull(); // each segment carries its own count
    expect(row.compliance_status).toBe('cleared');
    expect(row.needs_disclaimer).toBe(true);
    expect(row.disclaimer_snippet_id).toBe('snip-ga');
  });
});

describe('buildThreadSegmentRows', () => {
  it('returns ordered 1-based segments for a thread', () => {
    const rows = buildThreadSegmentRows('ci-1', THREAD);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ content_item_id: 'ci-1', sequence: 1, body: 'First point.' });
    expect(rows[1].sequence).toBe(2);
    expect(rows[0].char_count).toBe(Array.from('First point.').length);
  });

  it('returns nothing for a single post', () => {
    expect(buildThreadSegmentRows('ci-1', SINGLE)).toEqual([]);
  });
});
