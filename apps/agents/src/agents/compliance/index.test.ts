import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { ComplianceVerdict } from './index.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));

const { verdictToActivity, recordComplianceReview } = await import('./index.js');

function activityInserts() {
  return fakeSupabase
    .__buildersFor('agent_activity')
    .flatMap((b) => b.insert.mock.calls.map((c) => c[0] as Record<string, unknown>));
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  fakeSupabase.__setResponse('agent_activity', { data: { id: 'a1' }, error: null });
});

describe('verdictToActivity', () => {
  it('a passing verdict logs as auto with no rewrite', () => {
    const v: ComplianceVerdict = { passes: true, flags: [], rationale: 'Stated as context.', suggested_rewrite: null };
    const row = verdictToActivity(v, { contentItemId: 'c1' });
    expect(row).toMatchObject({
      agent_name: 'lex',
      status: 'auto',
      action: 'Compliance review: passed',
      entity_type: 'content_items',
      entity_id: 'c1',
    });
    expect(row.proposed_actions).toEqual([]);
    expect(row.notes).toContain('Stated as context.');
  });

  it('a failing verdict logs as pending, surfaces the flags, and carries the rewrite', () => {
    const v: ComplianceVerdict = {
      passes: false,
      flags: [{ quote: 'a buying opportunity', issue: 'frames MVRV as a buy signal' }],
      rationale: 'Reads as advice.',
      suggested_rewrite: 'bitcoin trades above the network’s aggregate cost basis.',
    };
    const row = verdictToActivity(v, { contentItemId: 'c1', parentActivityId: 'beat1' });
    expect(row).toMatchObject({ agent_name: 'lex', status: 'pending', parent_activity_id: 'beat1' });
    expect(row.notes).toContain('a buying opportunity');
    expect(row.notes).toContain('frames MVRV as a buy signal');
    expect(row.proposed_actions).toEqual([
      { kind: 'suggested_rewrite', body: 'bitcoin trades above the network’s aggregate cost basis.' },
    ]);
  });
});

describe('recordComplianceReview', () => {
  it('runs the (injected) reviewer and logs a pending verdict for flagged content', async () => {
    const flagged: ComplianceVerdict = {
      passes: false,
      flags: [{ quote: 'undervalued', issue: 'valuation judgement' }],
      rationale: 'Advice framing.',
      suggested_rewrite: null,
    };
    const review = vi.fn(async () => flagged);

    const verdict = await recordComplianceReview(
      { contentItemId: 'c1', title: 'On-chain note', body: 'MVRV says bitcoin is undervalued.' },
      review,
    );

    expect(review).toHaveBeenCalledWith({ title: 'On-chain note', body: 'MVRV says bitcoin is undervalued.' });
    expect(verdict.passes).toBe(false);
    const inserts = activityInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ agent_name: 'lex', status: 'pending', entity_id: 'c1' });
  });

  it('logs an auto verdict for compliant content', async () => {
    const passed: ComplianceVerdict = { passes: true, flags: [], rationale: 'Context only.', suggested_rewrite: null };
    const verdict = await recordComplianceReview(
      { contentItemId: 'c2', title: null, body: 'Hash rate reached 642 EH/s.' },
      async () => passed,
    );
    expect(verdict.passes).toBe(true);
    expect(activityInserts()[0]).toMatchObject({ agent_name: 'lex', status: 'auto', entity_id: 'c2' });
  });
});
