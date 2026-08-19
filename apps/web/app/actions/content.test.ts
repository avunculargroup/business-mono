import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakeRepositories,
  fakePublishGate,
  type FakeRepositories,
} from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// Converted to the seam in vertical 4.3a. The compliance-reset cases moved to
// the adapter, where that invariant now lives. What is left here is the rules
// and their wording — which is the half that belongs in the app, because a
// director reads these sentences.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'tm-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import { updateContentBody, scheduleContent, postContentNow, updateContentStatus } from './content';

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('updateContentBody', () => {
  it('saves the edit and revalidates both surfaces', async () => {
    const result = await updateContentBody('c1', { title: 'A title', body: 'Edited.' });

    expect(result).toEqual({ success: true });
    expect(repositories.content.updateBody).toHaveBeenCalledWith('c1', {
      title: 'A title',
      body: 'Edited.',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/content');
    expect(revalidatePath).toHaveBeenCalledWith('/content/c1');
  });

  it('says so when the item is gone', async () => {
    repositories.content.getEditGuard.mockResolvedValueOnce(null);

    expect(await updateContentBody('c1', { body: 'x' })).toEqual({
      error: 'Content item not found.',
    });
    expect(repositories.content.updateBody).not.toHaveBeenCalled();
  });

  it.each([
    ['published', 'Published content can no longer be edited.'],
    ['archived', 'Published content can no longer be edited.'],
  ])('refuses to edit %s content', async (status, message) => {
    repositories.content.getEditGuard.mockResolvedValueOnce({
      status,
      isThread: false,
      isPublishLocked: false,
    });

    expect(await updateContentBody('c1', { body: 'x' })).toEqual({ error: message });
    expect(repositories.content.updateBody).not.toHaveBeenCalled();
  });

  it('refuses to edit while the publisher holds the row', async () => {
    repositories.content.getEditGuard.mockResolvedValueOnce({
      status: 'approved',
      isThread: false,
      isPublishLocked: true,
    });

    expect(await updateContentBody('c1', { body: 'x' })).toEqual({
      error: 'This post is being published right now and cannot be edited.',
    });
  });

  it('sends thread edits to the per-segment editor', async () => {
    repositories.content.getEditGuard.mockResolvedValueOnce({
      status: 'draft',
      isThread: true,
      isPublishLocked: false,
    });

    expect(await updateContentBody('c1', { body: 'x' })).toEqual({
      error: 'Thread segments are edited per segment, not here.',
    });
  });
});

describe('scheduleContent', () => {
  const when = '2026-09-01T09:00:00.000Z';

  it('schedules an approved, cleared, connected LinkedIn post', async () => {
    const result = await scheduleContent('c1', when);

    expect(result).toEqual({ success: true });
    expect(repositories.content.schedule).toHaveBeenCalledWith('c1', new Date(when));
  });

  it('refuses a date it cannot read, before touching the repository', async () => {
    expect(await scheduleContent('c1', 'not a date')).toEqual({
      error: 'Pick a valid date and time.',
    });
    expect(repositories.content.getPublishGate).not.toHaveBeenCalled();
  });

  it('says so when the item is gone', async () => {
    repositories = createFakeRepositories({ publishGate: null });

    expect(await scheduleContent('c1', when)).toEqual({ error: 'Content item not found.' });
  });

  // One case per rule, each breaking exactly one field of an otherwise valid
  // gate — so a rule that stops firing shows up as its own failure.
  it.each([
    [
      { type: 'blog' },
      'Only LinkedIn posts can be scheduled for API publishing.',
    ],
    [{ status: 'draft' as const }, 'Approve the post before scheduling it.'],
    [{ approvedBy: null }, 'Posts must be approved by a person before scheduling.'],
    [{ complianceStatus: 'flagged' }, 'Compliance review has not cleared this post.'],
    [{ isThread: true }, 'Threads are not supported on LinkedIn.'],
    [{ body: '   ' }, 'The post body is empty.'],
    [{ socialAccountId: null }, 'Link the post to a social account first.'],
    [
      { credentialExpiresAt: null },
      'The LinkedIn account is not connected — connect it in Settings → Integrations.',
    ],
    [
      { credentialExpiresAt: new Date(Date.now() - 1000).toISOString() },
      'The LinkedIn token has expired — reconnect it in Settings → Integrations.',
    ],
  ])('refuses %o', async (broken, message) => {
    repositories = createFakeRepositories({ publishGate: fakePublishGate(broken) });

    expect(await scheduleContent('c1', when)).toEqual({ error: message });
    expect(repositories.content.schedule).not.toHaveBeenCalled();
  });

  it('refuses an over-length body and says by how much', async () => {
    repositories = createFakeRepositories({
      publishGate: fakePublishGate({ body: 'x'.repeat(3001), maxChars: 3000 }),
    });

    expect(await scheduleContent('c1', when)).toEqual({
      error: 'The post is 3001 characters — LinkedIn allows 3000.',
    });
  });

  it('allows a long post when the platform publishes no limit', async () => {
    // `max_chars` is null for a platform that does not declare one; treating
    // that as zero would block every post on it.
    repositories = createFakeRepositories({
      publishGate: fakePublishGate({ body: 'x'.repeat(9000), maxChars: null }),
    });

    expect(await scheduleContent('c1', when)).toEqual({ success: true });
  });

  it('lets an already-scheduled post be re-scheduled', async () => {
    repositories = createFakeRepositories({ publishGate: fakePublishGate({ status: 'scheduled' }) });

    expect(await scheduleContent('c1', when)).toEqual({ success: true });
  });

  it('surfaces a humane error when the write fails', async () => {
    repositories.content.schedule.mockRejectedValueOnce({
      code: '42501',
      message: 'new row violates row-level security policy',
    });

    expect(await scheduleContent('c1', when)).toEqual({
      error: "You don't have permission to do that.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('postContentNow', () => {
  it('schedules for now', async () => {
    const before = Date.now();

    expect(await postContentNow('c1')).toEqual({ success: true });

    const [, when] = repositories.content.schedule.mock.calls[0] as [string, Date];
    expect(when.getTime()).toBeGreaterThanOrEqual(before);
    expect(when.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('updateContentStatus', () => {
  it('moves an item and revalidates the board', async () => {
    expect(await updateContentStatus('c1', 'review')).toEqual({ success: true });
    expect(repositories.content.setStatus).toHaveBeenCalledWith('c1', 'review');
    expect(revalidatePath).toHaveBeenCalledWith('/content');
  });

  it('returns the auth error when signed out', async () => {
    authed = false;

    expect(await updateContentStatus('c1', 'review')).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(repositories.content.setStatus).not.toHaveBeenCalled();
  });
});
