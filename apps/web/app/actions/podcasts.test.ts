import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { generateEpisodeBrief, decideEpisodeBrief } from './podcasts';

function updateCall(): Record<string, unknown> | undefined {
  const builder = client.__buildersFor('podcast_episodes').find((b) => b.update.mock.calls.length > 0);
  return builder?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('generateEpisodeBrief', () => {
  it('requests the summarize action and revalidates the episode', async () => {
    client.__setResponse('podcast_episodes', { data: null, error: null });

    const result = await generateEpisodeBrief('ep-1');

    expect(result).toEqual({ success: true });
    expect(updateCall()).toEqual({ pending_action: 'summarize' });
    expect(revalidatePath).toHaveBeenCalledWith('/news/podcasts/ep-1');
  });

  it('surfaces a humane error without revalidating on failure', async () => {
    client.__setResponse('podcast_episodes', { data: null, error: { message: 'boom' } });

    const result = await generateEpisodeBrief('ep-1');

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('decideEpisodeBrief', () => {
  it('approves a proposed brief, stamping the approver', async () => {
    client.__setResponse('podcast_episodes', { data: { summary_status: 'proposed' }, error: null });
    client.__setUser({ id: 'user-9' });

    const result = await decideEpisodeBrief('ep-1', 'approve');

    expect(result).toEqual({ success: true });
    expect(updateCall()).toMatchObject({ summary_status: 'approved', summary_approved_by: 'user-9' });
    expect(updateCall()?.summary_approved_at).toEqual(expect.any(String));
    expect(revalidatePath).toHaveBeenCalledWith('/news/podcasts/ep-1');
  });

  it('rejects a proposed brief, clearing the draft', async () => {
    client.__setResponse('podcast_episodes', { data: { summary_status: 'proposed' }, error: null });

    const result = await decideEpisodeBrief('ep-1', 'reject');

    expect(result).toEqual({ success: true });
    expect(updateCall()).toMatchObject({ summary_status: 'none', episode_summary: null, summary_lex_verdict: null });
  });

  it('refuses to decide when there is no proposed draft', async () => {
    client.__setResponse('podcast_episodes', { data: { summary_status: 'none' }, error: null });

    const result = await decideEpisodeBrief('ep-1', 'approve');

    expect(result.error).toBeTruthy();
    expect(updateCall()).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects an unknown decision', async () => {
    const result = await decideEpisodeBrief('ep-1', 'maybe' as 'approve');
    expect(result.error).toBeTruthy();
  });
});
