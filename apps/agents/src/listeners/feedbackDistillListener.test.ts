import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fake client + editor spy, wired through the module mocks below.
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

const { distillAccountFeedback, backfillUndistilledFeedback } = await import('./feedbackDistillListener.js');

const ACCOUNT_ID = 'acc-li';

const CLAIMED_ROWS = [
  { id: 'fb-1', verdict: 'negative', feedback: 'Too preachy.', post_form: 'teach', draft_excerpt: 'Draft one…' },
  { id: 'fb-2', verdict: null, feedback: 'More like this.', post_form: null, draft_excerpt: null },
];

function wireHappyPath() {
  fakeSupabase.__setResponse('content_feedback', { data: CLAIMED_ROWS, error: null });
  fakeSupabase.__setResponse('social_accounts', {
    data: { display_name: 'Chris Pollard', platform: 'linkedin' },
    error: null,
  });
  // Same table key serves the maybeSingle read (data.guidelines) and the upsert
  // (error-only check).
  fakeSupabase.__setResponse('account_feedback_guidelines', {
    data: { guidelines: ['Never open with a question.'] },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  fakeSupabase.__builders.length = 0;
  editorGenerate.mockResolvedValue({ object: { guidelines: ['Never open with a question.', 'Drop the closing lesson.'] } });
});

describe('distillAccountFeedback', () => {
  it('claims undistilled rows, distills, and upserts the revised guidelines', async () => {
    wireHappyPath();

    await distillAccountFeedback(ACCOUNT_ID);

    // Atomic claim: conditional update on distilled_at IS NULL for this account.
    const claim = fakeSupabase.__buildersFor('content_feedback')[0]!;
    expect(claim.update).toHaveBeenCalledWith(expect.objectContaining({ distilled_at: expect.any(String) }));
    expect(claim.eq).toHaveBeenCalledWith('social_account_id', ACCOUNT_ID);
    expect(claim.is).toHaveBeenCalledWith('distilled_at', null);

    // The editor saw the current guidelines and both feedback notes.
    expect(editorGenerate).toHaveBeenCalledTimes(1);
    const prompt = editorGenerate.mock.calls[0]![0][0].content as string;
    expect(prompt).toContain('Never open with a question.');
    expect(prompt).toContain('Too preachy.');
    expect(prompt).toContain('More like this.');

    // Upsert carries the revised list; updated_by null marks a distiller write.
    const upserts = fakeSupabase
      .__buildersFor('account_feedback_guidelines')
      .filter((b) => b.upsert.mock.calls.length > 0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        social_account_id: ACCOUNT_ID,
        guidelines: ['Never open with a question.', 'Drop the closing lesson.'],
        updated_by: null,
      }),
    );
  });

  it('bails without distilling when the claim returns no rows (already taken)', async () => {
    fakeSupabase.__setResponse('content_feedback', { data: [], error: null });

    await distillAccountFeedback(ACCOUNT_ID);

    expect(editorGenerate).not.toHaveBeenCalled();
    expect(fakeSupabase.__buildersFor('account_feedback_guidelines')).toHaveLength(0);
  });

  it('unclaims the rows when distillation returns no structured output', async () => {
    wireHappyPath();
    editorGenerate.mockResolvedValue({ object: null });

    await distillAccountFeedback(ACCOUNT_ID);

    // Second content_feedback builder is the unclaim: distilled_at back to null.
    const builders = fakeSupabase.__buildersFor('content_feedback');
    expect(builders).toHaveLength(2);
    expect(builders[1]!.update).toHaveBeenCalledWith({ distilled_at: null });
    expect(builders[1]!.in).toHaveBeenCalledWith('id', ['fb-1', 'fb-2']);
  });

  it('unclaims the rows when the upsert fails', async () => {
    wireHappyPath();
    fakeSupabase.__setResponses('account_feedback_guidelines', [
      { data: { guidelines: [] }, error: null }, // maybeSingle read
      { data: null, error: { message: 'boom' } }, // upsert
    ]);

    await distillAccountFeedback(ACCOUNT_ID);

    const builders = fakeSupabase.__buildersFor('content_feedback');
    expect(builders[1]!.update).toHaveBeenCalledWith({ distilled_at: null });
  });
});

describe('backfillUndistilledFeedback', () => {
  it('distills once per account with undistilled feedback', async () => {
    // First content_feedback query is the backfill select (two rows, one
    // account); the second is the claim issued by the distill run.
    fakeSupabase.__setResponses('content_feedback', [
      { data: [{ social_account_id: ACCOUNT_ID }, { social_account_id: ACCOUNT_ID }], error: null },
      { data: CLAIMED_ROWS, error: null },
    ]);
    fakeSupabase.__setResponse('social_accounts', {
      data: { display_name: 'Chris Pollard', platform: 'linkedin' },
      error: null,
    });
    fakeSupabase.__setResponse('account_feedback_guidelines', { data: null, error: null });

    await backfillUndistilledFeedback();

    expect(editorGenerate).toHaveBeenCalledTimes(1);
  });

  it('is non-fatal when the select fails', async () => {
    fakeSupabase.__setResponse('content_feedback', { data: null, error: { message: 'down' } });

    await expect(backfillUndistilledFeedback()).resolves.toBeUndefined();
    expect(editorGenerate).not.toHaveBeenCalled();
  });
});
