import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { approveActivity } from './approvals';

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('approveActivity', () => {
  it('writes the decision to the activity row and revalidates the surfaces', async () => {
    client.__setResponse('agent_activity', { data: null, error: null });

    const result = await approveActivity('a1', 'approved', 'looks good');

    expect(result).toEqual({ success: true });
    const builder = client.__buildersFor('agent_activity')[0];
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', notes: 'looks good' }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'a1');
    expect(revalidatePath).toHaveBeenCalledWith('/simon');
    expect(revalidatePath).toHaveBeenCalledWith('/activity');
  });

  it('stores null notes when no response is given', async () => {
    client.__setResponse('agent_activity', { data: null, error: null });

    await approveActivity('a1', 'rejected');

    expect(client.__buildersFor('agent_activity')[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', notes: null }),
    );
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await approveActivity('a1', 'approved');

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('surfaces a humane error and does not revalidate when the update fails', async () => {
    client.__setResponse('agent_activity', { data: null, error: { message: 'nope' } });

    const result = await approveActivity('a1', 'approved');

    expect(result).toHaveProperty('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
