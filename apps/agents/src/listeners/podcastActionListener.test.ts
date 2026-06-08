import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fake client + reResolve spy, wired through the module mocks below.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const reResolveSpy = vi.fn(async () => undefined);

vi.mock('@platform/db', () => ({
  createRealtimeClient: () => fakeSupabase,
}));
vi.mock('../lib/transcripts/reResolve.js', () => ({
  parseEpisodeAction: (action: string) =>
    action === 'deepgram'
      ? { forceDeepgram: true }
      : action === 'refetch' || action === 'retry'
        ? { forceDeepgram: false }
        : null,
  reResolveEpisode: reResolveSpy,
}));

const { handleEpisodeActionRow } = await import('./podcastActionListener.js');

describe('handleEpisodeActionRow', () => {
  beforeEach(() => {
    reResolveSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('claims the action and re-resolves the episode', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [{ id: 'ep-1' }], error: null });

    await handleEpisodeActionRow({ id: 'ep-1', pending_action: 'deepgram' });

    const builder = fakeSupabase.__buildersFor('podcast_episodes')[0];
    expect(builder?.update).toHaveBeenCalledWith({ pending_action: null });
    expect(builder?.not).toHaveBeenCalledWith('pending_action', 'is', null);
    expect(reResolveSpy).toHaveBeenCalledWith('ep-1', { forceDeepgram: true });
  });

  it('does not re-resolve when the claim affects no row (already taken)', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [], error: null });

    await handleEpisodeActionRow({ id: 'ep-1', pending_action: 'refetch' });

    expect(reResolveSpy).not.toHaveBeenCalled();
  });

  it('ignores rows with no pending action without touching the db', async () => {
    await handleEpisodeActionRow({ id: 'ep-1', pending_action: null });

    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(reResolveSpy).not.toHaveBeenCalled();
  });

  it('claims but does not re-resolve an unknown action', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [{ id: 'ep-1' }], error: null });

    await handleEpisodeActionRow({ id: 'ep-1', pending_action: 'explode' });

    expect(fakeSupabase.from).toHaveBeenCalledWith('podcast_episodes');
    expect(reResolveSpy).not.toHaveBeenCalled();
  });
});
