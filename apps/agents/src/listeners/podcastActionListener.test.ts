import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fake client + reResolve/runEpisodeIntel spies, wired through the module
// mocks below.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const reResolveSpy = vi.fn(async () => undefined);
const runEpisodeIntelSpy = vi.fn(async () => undefined);

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
vi.mock('../workflows/podcastIntel/index.js', () => ({
  runEpisodeIntel: runEpisodeIntelSpy,
}));

const { handleEpisodeActionRow, reconcilePendingActions, failStaleGeneratingBriefs, reconcile } =
  await import('./podcastActionListener.js');

describe('handleEpisodeActionRow', () => {
  beforeEach(() => {
    reResolveSpy.mockClear();
    runEpisodeIntelSpy.mockClear();
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

  it('claims a summarize action and runs the intelligence pass', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [{ id: 'ep-1' }], error: null });

    await handleEpisodeActionRow({ id: 'ep-1', pending_action: 'summarize' });

    const builder = fakeSupabase.__buildersFor('podcast_episodes')[0];
    expect(builder?.update).toHaveBeenCalledWith({ pending_action: null });
    expect(runEpisodeIntelSpy).toHaveBeenCalledWith('ep-1');
    expect(reResolveSpy).not.toHaveBeenCalled();
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

describe('reconcilePendingActions', () => {
  beforeEach(() => {
    reResolveSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('sweeps and re-resolves episodes whose pending action Realtime missed', async () => {
    fakeSupabase.__setResponse('podcast_episodes', {
      data: [{ id: 'ep-9', pending_action: 'refetch' }],
      error: null,
    });

    await reconcilePendingActions();

    const builder = fakeSupabase.__buildersFor('podcast_episodes')[0];
    expect(builder?.select).toHaveBeenCalledWith('id, pending_action');
    expect(builder?.not).toHaveBeenCalledWith('pending_action', 'is', null);
    expect(reResolveSpy).toHaveBeenCalledWith('ep-9', { forceDeepgram: false });
  });

  it('does nothing when no episode carries a pending action', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [], error: null });

    await reconcilePendingActions();

    expect(reResolveSpy).not.toHaveBeenCalled();
  });
});

describe('failStaleGeneratingBriefs', () => {
  beforeEach(() => {
    runEpisodeIntelSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('fails only orphaned generating rows older than the timeout', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [{ id: 'ep-stale' }], error: null });

    await failStaleGeneratingBriefs();

    const builder = fakeSupabase.__buildersFor('podcast_episodes')[0];
    expect(builder?.update).toHaveBeenCalledWith({ summary_status: 'failed' });
    // Scoped to generating rows whose pending_action is already cleared (the
    // claimed-then-died orphan case) and that have been generating past the
    // timeout — a row still carrying a pending_action is left to the re-run sweep.
    expect(builder?.eq).toHaveBeenCalledWith('summary_status', 'generating');
    expect(builder?.is).toHaveBeenCalledWith('pending_action', null);
    expect(builder?.lt).toHaveBeenCalledWith('updated_at', expect.any(String));
  });

  it('does not run the intelligence pass (fails, never re-runs)', async () => {
    fakeSupabase.__setResponse('podcast_episodes', { data: [], error: null });

    await failStaleGeneratingBriefs();

    expect(runEpisodeIntelSpy).not.toHaveBeenCalled();
  });
});

describe('reconcile', () => {
  beforeEach(() => {
    reResolveSpy.mockClear();
    runEpisodeIntelSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('re-runs an unclaimed pending action and sweeps stale generating rows in one pass', async () => {
    // First from(): the pending-action select. Second: the claim update. Third:
    // the stale-generating sweep.
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: [{ id: 'ep-9', pending_action: 'summarize' }], error: null },
      { data: [{ id: 'ep-9' }], error: null },
      { data: [], error: null },
    ]);

    await reconcile();

    expect(runEpisodeIntelSpy).toHaveBeenCalledWith('ep-9');
    const sweep = fakeSupabase.__buildersFor('podcast_episodes').at(-1);
    expect(sweep?.update).toHaveBeenCalledWith({ summary_status: 'failed' });
  });
});
