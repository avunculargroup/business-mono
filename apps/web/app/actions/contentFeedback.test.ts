import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// Converted to the seam in vertical 4.3b. The denormalisation cases — platform
// and post form copied onto the row, a thread snapshotted as its joined
// segments — moved to the adapter, which is where that shaping now happens.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import { submitDraftFeedback } from './contentFeedback';

const ITEM_ID = '2b8f4c1a-0000-4000-8000-000000000001';

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('submitDraftFeedback', () => {
  it('records the note and revalidates the draft', async () => {
    const result = await submitDraftFeedback({
      contentItemId: ITEM_ID,
      feedback: '  Too preachy.  ',
      verdict: 'negative',
    });

    expect(result).toEqual({ success: true });
    expect(repositories.content.addDraftFeedback).toHaveBeenCalledWith(ITEM_ID, {
      feedback: 'Too preachy.',
      verdict: 'negative',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/content/${ITEM_ID}`);
  });

  it('leaves the verdict out when none was given', async () => {
    await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Good thread.' });

    expect(repositories.content.addDraftFeedback).toHaveBeenCalledWith(ITEM_ID, {
      feedback: 'Good thread.',
      verdict: undefined,
    });
  });

  it('explains why a draft with no social account cannot take feedback', async () => {
    repositories.content.addDraftFeedback.mockResolvedValueOnce(false);

    const result = await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Note.' });

    expect(result).toEqual({
      error: "This draft has no social account, so feedback can't improve future posts.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects empty feedback before touching the repository', async () => {
    expect(await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: '   ' })).toEqual({
      error: 'Write a note first',
    });
    expect(repositories.content.addDraftFeedback).not.toHaveBeenCalled();
  });

  it('returns the auth error when signed out', async () => {
    authed = false;

    expect(await submitDraftFeedback({ contentItemId: ITEM_ID, feedback: 'Note.' })).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(repositories.content.addDraftFeedback).not.toHaveBeenCalled();
  });
});
