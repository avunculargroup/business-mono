import { describe, it, expect, vi, beforeEach } from 'vitest';
// executeRoutine declares a schedule, which auto-promotes it to Mastra's evented
// engine; that engine module must be loaded before the workflow is constructed.
import '@mastra/core/workflows/evented';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// executeRoutineWorkflow pulls in @platform/db and the rex/charlie/editor agents
// at module load. Mock the heavy edges so the claim logic can be exercised alone.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../agents/researcher/index.js', () => ({ rex: { generate: vi.fn() } }));
vi.mock('../agents/contentCreator/index.js', () => ({ charlie: { generate: vi.fn() } }));
vi.mock('../agents/editorial/index.js', () => ({ editor: { generate: vi.fn() } }));
vi.mock('../agents/researcher/tools.js', () => ({ fetchUrl: vi.fn() }));
vi.mock('./startNewsletterRun.js', () => ({ startNewsletterRun: vi.fn() }));
vi.mock('../lib/transcripts/resolveTranscript.js', () => ({ resolveTranscript: vi.fn() }));
vi.mock('../lib/transcripts/store.js', () => ({
  insertEpisode: vi.fn(),
  updateEpisode: vi.fn(),
  fetchExistingGuids: vi.fn(),
  storeAvailableTranscript: vi.fn(),
}));
vi.mock('../config/model.js', () => ({
  stepRequestContext: vi.fn(() => ({})),
  dynamicModelFor: vi.fn(() => 'mock-model'),
}));

const { selectAndClaimDueRoutines } = await import('./executeRoutineWorkflow.js');

function dueRoutineRow(id: string, name: string) {
  return {
    id,
    name,
    agent_name: 'charlie',
    action_type: 'news_curation',
    action_config: { max_stories: 6 },
    frequency: 'daily',
    time_of_day: '08:00',
    timezone: 'Australia/Melbourne',
  };
}

describe('selectAndClaimDueRoutines', () => {
  beforeEach(() => {
    fakeSupabase.__builders.length = 0;
    fakeSupabase.__responses.clear();
  });

  it('claims a routine by advancing next_run_at while it is still due, then returns it', async () => {
    // 1st from('routines') = SELECT of due rows; 2nd = the claim UPDATE (won).
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'Daily news curation')], error: null },
      { data: [{ id: 'r1' }], error: null },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed.map((r) => r.id)).toEqual(['r1']);

    const routineBuilders = fakeSupabase.__buildersFor('routines');
    // The claim builder issued an UPDATE gated on the row still being due.
    const claimBuilder = routineBuilders[1]!;
    expect(claimBuilder.update).toHaveBeenCalledTimes(1);
    const patch = claimBuilder.update.mock.calls[0]![0] as { next_run_at: string };
    expect(new Date(patch.next_run_at).getTime()).toBeGreaterThan(Date.now());
    expect(claimBuilder.eq).toHaveBeenCalledWith('id', 'r1');
    // Gated on next_run_at <= now so a concurrent tick can't double-claim.
    expect(claimBuilder.lte.mock.calls.some((c) => c[0] === 'next_run_at')).toBe(true);
  });

  it('skips a routine whose claim was won by a concurrent tick (empty update result)', async () => {
    // The claim UPDATE returns [] — another tick already advanced next_run_at.
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'Daily news curation')], error: null },
      { data: [], error: null },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed).toEqual([]);
  });

  it('only returns the routines it actually claims when several are due', async () => {
    // SELECT returns two due routines; the first claim wins, the second loses.
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'A'), dueRoutineRow('r2', 'B')], error: null },
      { data: [{ id: 'r1' }], error: null },
      { data: [], error: null },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed.map((r) => r.id)).toEqual(['r1']);
  });

  it('clears a pending run request when it claims a scheduled run', async () => {
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'Daily news curation')], error: null },
      { data: [{ id: 'r1' }], error: null },
      { data: [], error: null },
    ]);

    await selectAndClaimDueRoutines();

    const patch = fakeSupabase.__buildersFor('routines')[1]!.update.mock.calls[0]![0];
    expect(patch).toMatchObject({ run_requested_at: null });
  });

  it('runs a requested routine whether or not it is active, claiming it by clearing the request', async () => {
    // 1st = scheduled SELECT (nothing due); 2nd = requested SELECT; 3rd = request claim (won).
    fakeSupabase.__setResponses('routines', [
      { data: [], error: null },
      { data: [dueRoutineRow('r2', 'Weekly corporate research ingest')], error: null },
      { data: [{ id: 'r2' }], error: null },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed.map((r) => r.id)).toEqual(['r2']);
    const [scheduled, requested, claim] = fakeSupabase.__buildersFor('routines');
    expect(scheduled!.eq).toHaveBeenCalledWith('is_active', true);
    // The requested lookup does not filter on is_active.
    expect(requested!.eq).not.toHaveBeenCalledWith('is_active', true);
    expect(requested!.not).toHaveBeenCalledWith('run_requested_at', 'is', null);
    // The claim clears only the request and leaves the schedule alone.
    expect(claim!.update).toHaveBeenCalledWith({ run_requested_at: null });
    expect(claim!.eq).toHaveBeenCalledWith('id', 'r2');
    expect(claim!.not).toHaveBeenCalledWith('run_requested_at', 'is', null);
  });

  it('skips a request a concurrent tick already claimed', async () => {
    fakeSupabase.__setResponses('routines', [
      { data: [], error: null },
      { data: [dueRoutineRow('r2', 'B')], error: null },
      { data: [], error: null },
    ]);

    await expect(selectAndClaimDueRoutines()).resolves.toEqual([]);
  });

  it('does not run a routine twice when it is both due and requested', async () => {
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'A')], error: null },
      { data: [{ id: 'r1' }], error: null },
      { data: [dueRoutineRow('r1', 'A')], error: null },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed.map((r) => r.id)).toEqual(['r1']);
    // No request claim was attempted for r1.
    expect(fakeSupabase.__buildersFor('routines')).toHaveLength(3);
  });

  it('keeps the scheduled claims when the requested lookup fails', async () => {
    fakeSupabase.__setResponses('routines', [
      { data: [dueRoutineRow('r1', 'A')], error: null },
      { data: [{ id: 'r1' }], error: null },
      { data: null, error: { message: 'column "run_requested_at" does not exist' } },
    ]);

    const claimed = await selectAndClaimDueRoutines();

    expect(claimed.map((r) => r.id)).toEqual(['r1']);
  });

  it('returns nothing (and does not throw) when the routines table is missing', async () => {
    fakeSupabase.__setResponse('routines', {
      data: null,
      error: { message: 'relation "routines" does not exist' },
    });

    await expect(selectAndClaimDueRoutines()).resolves.toEqual([]);
  });
});
