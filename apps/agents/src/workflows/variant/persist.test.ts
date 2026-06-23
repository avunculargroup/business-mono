import { describe, it, expect } from 'vitest';
import {
  complianceStatusFor,
  resolveDisclaimerSnippetId,
  buildContentItemRow,
  buildThreadSegmentRows,
} from './persist.js';
import type { VariantContext, CharlieVariant, LexVerdict } from './schemas.js';

const ctx: VariantContext = {
  input: {
    campaignId: 'camp-1',
    beatId: 'beat-1',
    socialAccountId: 'acct-1',
  } as VariantContext['input'],
  platform: 'twitter_x',
  accountDisplayName: 'Chris (X)',
  voiceBlock: '...',
  platformSpec: { platform: 'twitter_x', max_chars: 280 },
  strategy: {},
  beat: { id: 'beat-1', core_message: 'msg', prefer_thread: true },
  disclaimerSnippets: [
    { id: 'snip-1', key: 'general_advice_warning' },
    { id: 'snip-2', key: 'no_personal_advice' },
  ],
};

const singlePost: CharlieVariant = {
  is_thread: false,
  title: 'T',
  body: 'A plain single post.',
  segments: [],
  charlie_note: '',
};

const thread: CharlieVariant = {
  is_thread: true,
  title: 'T',
  body: 'lead',
  segments: [{ body: 'seg one' }, { body: 'seg two' }],
  charlie_note: '',
};

const cleared: LexVerdict = {
  classification: 'general_advice',
  needs_disclaimer: true,
  disclaimer_key: 'general_advice_warning',
  rationale: 'Touches allocation.',
};

describe('complianceStatusFor', () => {
  it('flags personal_opinion and clears the rest', () => {
    expect(complianceStatusFor({ ...cleared, classification: 'personal_opinion' })).toBe('flagged');
    expect(complianceStatusFor({ ...cleared, classification: 'general_advice' })).toBe('cleared');
    expect(complianceStatusFor({ ...cleared, classification: 'educational' })).toBe('cleared');
  });
});

describe('resolveDisclaimerSnippetId', () => {
  it('maps the chosen key to a snippet id', () => {
    expect(resolveDisclaimerSnippetId(cleared, ctx.disclaimerSnippets)).toBe('snip-1');
  });
  it('returns null when no disclaimer is needed', () => {
    expect(
      resolveDisclaimerSnippetId({ ...cleared, needs_disclaimer: false }, ctx.disclaimerSnippets),
    ).toBeNull();
  });
  it('returns null when the key matches no active snippet', () => {
    expect(
      resolveDisclaimerSnippetId({ ...cleared, disclaimer_key: 'nope' }, ctx.disclaimerSnippets),
    ).toBeNull();
  });
});

describe('buildContentItemRow', () => {
  it('maps a single post with a cached char_count and compliance fields', () => {
    const row = buildContentItemRow({ ctx, draft: singlePost, verdict: cleared, checkedAt: '2026-06-22T00:00:00Z' });
    expect(row).toMatchObject({
      type: 'twitter_x',
      status: 'draft',
      source: 'charlie',
      campaign_id: 'camp-1',
      beat_id: 'beat-1',
      social_account_id: 'acct-1',
      is_thread: false,
      char_count: singlePost.body.length,
      compliance_status: 'cleared',
      compliance_classification: 'general_advice',
      needs_disclaimer: true,
      disclaimer_snippet_id: 'snip-1',
      compliance_checked_at: '2026-06-22T00:00:00Z',
    });
  });

  it('leaves char_count null on a thread (segments carry their own)', () => {
    const row = buildContentItemRow({ ctx, draft: thread, verdict: cleared, checkedAt: '2026-06-22T00:00:00Z' });
    expect(row.is_thread).toBe(true);
    expect(row.char_count).toBeNull();
  });
});

describe('buildThreadSegmentRows', () => {
  it('builds 1-based ordered rows with per-segment char_count', () => {
    const rows = buildThreadSegmentRows('ci-1', thread);
    expect(rows).toEqual([
      { content_item_id: 'ci-1', sequence: 1, body: 'seg one', char_count: 7 },
      { content_item_id: 'ci-1', sequence: 2, body: 'seg two', char_count: 7 },
    ]);
  });

  it('returns no rows for a single post', () => {
    expect(buildThreadSegmentRows('ci-1', singlePost)).toEqual([]);
  });
});
