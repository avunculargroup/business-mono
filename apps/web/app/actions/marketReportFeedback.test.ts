import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { submitMarketReportFeedback } from './marketReportFeedback';

const REPORT_ID = '2b8f4c1a-0000-4000-8000-000000000002';

const REPORT = {
  id: REPORT_ID,
  narration_markdown: 'Hash rate fell 8% overnight, outside its normal daily band.',
};

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('submitMarketReportFeedback', () => {
  it('snapshots the narration excerpt and inserts the feedback row', async () => {
    client.__setResponse('market_reports', { data: REPORT, error: null });
    client.__setResponse('market_report_feedback', { data: null, error: null });

    const result = await submitMarketReportFeedback({
      marketReportId: REPORT_ID,
      feedback: '  Too long — tighten it.  ',
      verdict: 'negative',
    });

    expect(result).toEqual({ success: true });
    const insert = client.__buildersFor('market_report_feedback')[0];
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        market_report_id: REPORT_ID,
        verdict: 'negative',
        feedback: 'Too long — tighten it.',
        narration_excerpt: REPORT.narration_markdown,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/market-reports/${REPORT_ID}`);
  });

  it('stores a null excerpt for a report without a narration', async () => {
    client.__setResponse('market_reports', { data: { id: REPORT_ID, narration_markdown: null }, error: null });
    client.__setResponse('market_report_feedback', { data: null, error: null });

    await submitMarketReportFeedback({ marketReportId: REPORT_ID, feedback: 'Where was the commentary?' });

    expect(client.__buildersFor('market_report_feedback')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ narration_excerpt: null, verdict: null }),
    );
  });

  it('rejects empty feedback before touching the db', async () => {
    const result = await submitMarketReportFeedback({ marketReportId: REPORT_ID, feedback: '   ' });

    expect(result).toHaveProperty('error');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('surfaces a lookup error for an unknown report', async () => {
    client.__setResponse('market_reports', { data: null, error: { message: 'No rows found' } });

    const result = await submitMarketReportFeedback({ marketReportId: REPORT_ID, feedback: 'Note.' });

    expect(result).toHaveProperty('error');
    expect(client.__buildersFor('market_report_feedback')).toHaveLength(0);
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await submitMarketReportFeedback({ marketReportId: REPORT_ID, feedback: 'Note.' });

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
  });
});
