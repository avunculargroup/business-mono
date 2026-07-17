import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { submitDraftFeedback } from './contentFeedback';

const ITEM_ID = '2b8f4c1a-0000-4000-8000-000000000001';

const SOCIAL_ITEM = {
  id: ITEM_ID,
  type: 'linkedin',
  body: 'The RBA held rates at 4.35%.',
  is_thread: false,
  social_account_id: 'acc-li',
  post_form: 'teach',
};

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('submitDraftFeedback', () => {
  it('denormalises the draft and inserts the feedback row', async () => {
    client.__setResponse('content_items', { data: SOCIAL_ITEM, error: null });
    client.__setResponse('content_feedback', { data: null, error: null });

    const result = await submitDraftFeedback({
      contentItemId: ITEM_ID,
      feedback: '  Too preachy.  ',
      verdict: 'negative',
    });

    expect(result).toEqual({ success: true });
    const insert = client.__buildersFor('content_feedback')[0];
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_item_id: ITEM_ID,
        social_account_id: 'acc-li',
        platform: 'linkedin',
        post_form: 'teach',
        verdict: 'negative',
        feedback: 'Too preachy.',
        draft_excerpt: 'The RBA held rates at 4.35%.',
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/content/${ITEM_ID}`);
  });

  it('snapshots a thread as the joined segment bodies', async () => {
    client.__setResponse('content_items', { data: { ...SOCIAL_ITEM, is_thread: true, body: 'Lead.' }, error: null });
    client.__setResponse('thread_segments', { data: [{ body: 'One.' }, { body: 'Two.' }], error: null });
    client.__setResponse('content_feedback', { data: null, error: null });

    await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Good thread.' });

    expect(client.__buildersFor('content_feedback')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ draft_excerpt: 'One. Two.', verdict: null }),
    );
  });

  it('rejects a draft with no social account', async () => {
    client.__setResponse('content_items', { data: { ...SOCIAL_ITEM, social_account_id: null }, error: null });

    const result = await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Note.' });

    expect(result).toHaveProperty('error');
    expect(client.__buildersFor('content_feedback')).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects empty feedback before touching the db', async () => {
    const result = await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: '   ' });

    expect(result).toHaveProperty('error');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Note.' });

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
  });
});
