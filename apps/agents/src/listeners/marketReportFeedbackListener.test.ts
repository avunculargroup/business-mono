import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const editorGenerate = vi.fn();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
  createRealtimeClient: () => fakeSupabase,
}));
vi.mock('../agents/editorial/index.js', () => ({ editor: { generate: editorGenerate } }));
vi.mock('../config/model.js', () => ({
  stepRequestContext: vi.fn(() => ({})),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { distillReportFeedback, backfillUndistilledReportFeedback } = await import(
  './marketReportFeedbackListener.js'
);

const CLAIMED_ROWS = [
  { id: 'fb-1', verdict: 'negative', feedback: 'Too long — tighten it.', narration_excerpt: 'Hash rate fell…' },
  { id: 'fb-2', verdict: null, feedback: 'Liked the macro link.', narration_excerpt: null },
];

function wireHappyPath() {
  fakeSupabase.__setResponse('market_report_feedback', { data: CLAIMED_ROWS, error: null });
  // Same table key serves the maybeSingle read (data.guidelines) and the upsert.
  fakeSupabase.__setResponse('market_report_guidelines', {
    data: { guidelines: ['Lead with the on-chain move.'] },
    error: null,
  });
  editorGenerate.mockResolvedValue({
    object: { guidelines: ['Lead with the on-chain move.', 'Keep the commentary under 100 words.'] },
  });
}

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  editorGenerate.mockReset();
});

describe('distillReportFeedback', () => {
  it('claims undistilled rows, distills via the editor, upserts the singleton', async () => {
    wireHappyPath();
    await distillReportFeedback();

    // Claim = conditional update on distilled_at IS NULL.
    const claim = fakeSupabase.__buildersFor('market_report_feedback')[0];
    expect(claim.update).toHaveBeenCalledWith(expect.objectContaining({ distilled_at: expect.any(String) }));
    expect(claim.is).toHaveBeenCalledWith('distilled_at', null);

    // The prompt carries current guidelines and the feedback notes.
    const prompt = (editorGenerate.mock.calls[0][0] as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Lead with the on-chain move.');
    expect(prompt).toContain('Too long — tighten it.');
    expect(prompt).toContain('never write a rule that conflicts');

    // Upsert targets the singleton row.
    const upsertBuilder = fakeSupabase
      .__buildersFor('market_report_guidelines')
      .find((b) => b.upsert.mock.calls.length > 0)!;
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, guidelines: expect.arrayContaining(['Keep the commentary under 100 words.']), updated_by: null }),
    );
  });

  it('does nothing when another handler already claimed the batch', async () => {
    fakeSupabase.__setResponse('market_report_feedback', { data: [], error: null });
    await distillReportFeedback();
    expect(editorGenerate).not.toHaveBeenCalled();
  });

  it('unclaims the rows when distillation fails', async () => {
    wireHappyPath();
    editorGenerate.mockResolvedValue({ object: null });
    await distillReportFeedback();

    const builders = fakeSupabase.__buildersFor('market_report_feedback');
    const unclaim = builders[builders.length - 1];
    expect(unclaim.update).toHaveBeenCalledWith({ distilled_at: null });
    expect(unclaim.in).toHaveBeenCalledWith('id', ['fb-1', 'fb-2']);
  });
});

describe('backfillUndistilledReportFeedback', () => {
  it('sweeps when undistilled rows exist', async () => {
    wireHappyPath();
    // First from(): the existence check; then the claim; then unclaim path unused.
    fakeSupabase.__setResponses('market_report_feedback', [
      { data: [{ id: 'fb-1' }], error: null },
      { data: CLAIMED_ROWS, error: null },
    ]);
    await backfillUndistilledReportFeedback();
    expect(editorGenerate).toHaveBeenCalledTimes(1);
  });

  it('never throws on a read failure', async () => {
    fakeSupabase.__setResponse('market_report_feedback', { data: null, error: { message: 'down' } });
    await expect(backfillUndistilledReportFeedback()).resolves.toBeUndefined();
    expect(editorGenerate).not.toHaveBeenCalled();
  });
});
