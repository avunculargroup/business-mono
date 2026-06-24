import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fake client + run spies, wired through the module mocks below.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const startSpy = vi.fn(async () => ({ runId: 'run-1', status: 'suspended' }));
const resumeSpy = vi.fn(async () => ({ status: 'success' }));

vi.mock('@platform/db', () => ({
  createRealtimeClient: () => fakeSupabase,
  // run.js (loaded via importActual below) imports `supabase` at module scope.
  supabase: fakeSupabase,
}));
vi.mock('../workflows/strategy/run.js', async () => {
  // Reuse the real validator (pure) but stub the side-effecting start/resume.
  const actual = await vi.importActual<typeof import('../workflows/strategy/run.js')>(
    '../workflows/strategy/run.js',
  );
  return {
    validateStrategyDecision: actual.validateStrategyDecision,
    startStrategyRun: startSpy,
    resumeStrategyRun: resumeSpy,
  };
});

const { handleStrategyGateRow, backfillPendingDecisions } = await import('./strategyGateWeb.js');

function claimSucceeds() {
  fakeSupabase.__setResponse('campaigns', { data: [{ id: 'camp-1' }], error: null });
}

describe('handleStrategyGateRow', () => {
  beforeEach(() => {
    startSpy.mockClear();
    resumeSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('ignores a row with no pending decision without touching the db', async () => {
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: null,
      gate_state: null,
      pending_decision: null,
    });
    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('starts the run on a start decision with no run id', async () => {
    claimSucceeds();
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: null,
      gate_state: null,
      pending_decision: { decision: 'start' },
    });
    const builder = fakeSupabase.__buildersFor('campaigns')[0];
    expect(builder?.update).toHaveBeenCalledWith({ pending_decision: null });
    expect(builder?.not).toHaveBeenCalledWith('pending_decision', 'is', null);
    expect(startSpy).toHaveBeenCalledWith({ campaignId: 'camp-1' });
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it('resumes gate1 with a validated decision', async () => {
    claimSucceeds();
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: 'run-1',
      gate_state: { gate: 'gate1' },
      pending_decision: { decision: 'approve' },
    });
    expect(resumeSpy).toHaveBeenCalledWith({
      runId: 'run-1',
      step: 'gate1',
      resumeData: { decision: 'approve' },
    });
  });

  it('resumes gate2 with edited beats', async () => {
    claimSucceeds();
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'strategy_approved',
      workflow_run_id: 'run-1',
      gate_state: { gate: 'gate2' },
      pending_decision: { decision: 'approve', beats: [{ core_message: 'idea' }] },
    });
    expect(resumeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', step: 'gate2' }),
    );
  });

  it('does not start/resume when the claim affects no row (already taken)', async () => {
    fakeSupabase.__setResponse('campaigns', { data: [], error: null });
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: null,
      gate_state: null,
      pending_decision: { decision: 'start' },
    });
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('claims but does not resume an invalid gate decision', async () => {
    claimSucceeds();
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: 'run-1',
      gate_state: { gate: 'gate1' },
      pending_decision: { decision: 'publish' }, // not a gate1 command
    });
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it('ignores an unknown gate in gate_state', async () => {
    await handleStrategyGateRow({
      id: 'camp-1',
      status: 'draft',
      workflow_run_id: 'run-1',
      gate_state: { gate: 'gate9' },
      pending_decision: { decision: 'approve' },
    });
    expect(resumeSpy).not.toHaveBeenCalled();
  });
});

describe('backfillPendingDecisions', () => {
  beforeEach(() => {
    startSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('processes a campaign left with a start decision while the listener was down', async () => {
    // The scan and the claim both read `campaigns`; one response serves both.
    fakeSupabase.__setResponse('campaigns', {
      data: [
        { id: 'camp-1', status: 'draft', workflow_run_id: null, gate_state: null, pending_decision: { decision: 'start' } },
      ],
      error: null,
    });

    await backfillPendingDecisions();

    // It filtered to rows with a pending decision, then launched the run.
    const scan = fakeSupabase.__buildersFor('campaigns')[0];
    expect(scan?.not).toHaveBeenCalledWith('pending_decision', 'is', null);
    expect(startSpy).toHaveBeenCalledWith({ campaignId: 'camp-1' });
  });

  it('does nothing when no campaign is pending', async () => {
    fakeSupabase.__setResponse('campaigns', { data: [], error: null });
    await backfillPendingDecisions();
    expect(startSpy).not.toHaveBeenCalled();
  });
});
