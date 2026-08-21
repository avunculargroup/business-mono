import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// Converted to the seam in vertical 4.1: the action no longer builds a query, so
// the test no longer describes one. It mocks the auth helper that hands back a
// bundle and asserts what the action does with it.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import { approveActivity } from './approvals';

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('approveActivity', () => {
  it('records the decision and revalidates the surfaces that show it', async () => {
    const result = await approveActivity('a1', 'approved', 'looks good');

    expect(result).toEqual({ success: true });
    expect(repositories.agentActivity.approveActivity).toHaveBeenCalledWith(
      'a1',
      'approved',
      'looks good',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/simon');
    expect(revalidatePath).toHaveBeenCalledWith('/activity');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('passes no response through when none is given', async () => {
    await approveActivity('a1', 'rejected');

    expect(repositories.agentActivity.approveActivity).toHaveBeenCalledWith(
      'a1',
      'rejected',
      undefined,
    );
  });

  it('returns the auth error when signed out, without touching the repository', async () => {
    authed = false;

    const result = await approveActivity('a1', 'approved');

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(repositories.agentActivity.approveActivity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces a humane error and does not revalidate when the write throws', async () => {
    repositories.agentActivity.approveActivity.mockRejectedValueOnce({
      code: '42501',
      message: 'new row violates row-level security policy',
    });

    const result = await approveActivity('a1', 'approved');

    expect(result).toEqual({ error: "You don't have permission to do that." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
