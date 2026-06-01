import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fake client + resume spy, wired through the module mocks below.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const resumeSpy = vi.fn(async () => ({ status: 'completed' }));

vi.mock('@platform/db', () => ({
  createRealtimeClient: () => fakeSupabase,
}));
vi.mock('../workflows/startNewsletterRun.js', () => ({
  resumeNewsletterRun: resumeSpy,
}));

const { validateWebDecision, handleGateRow } = await import('./newsletterGateWeb.js');

describe('validateWebDecision', () => {
  it('accepts a gate-1 approve', () => {
    expect(validateWebDecision('suspended_gate1', { decision: 'approve' })).toEqual({
      decision: 'approve',
    });
  });

  it('accepts a gate-1 adjust with text', () => {
    expect(
      validateWebDecision('suspended_gate1', { decision: 'adjust', adjustment: 'more regulation' }),
    ).toEqual({ decision: 'adjust', adjustment: 'more regulation' });
  });

  it('rejects a gate-2 command at gate 1', () => {
    expect(validateWebDecision('suspended_gate1', { decision: 'publish' })).toBeNull();
  });

  it('accepts gate-2 publish / revise / hold', () => {
    expect(validateWebDecision('suspended_gate2', { decision: 'publish' })).toEqual({
      decision: 'publish',
    });
    expect(
      validateWebDecision('suspended_gate2', {
        decision: 'revise',
        storyNumber: 2,
        instruction: 'tighten it',
      }),
    ).toEqual({ decision: 'revise', storyNumber: 2, instruction: 'tighten it' });
    expect(validateWebDecision('suspended_hold', { decision: 'hold' })).toEqual({
      decision: 'hold',
    });
  });

  it('returns null for a non-suspended status', () => {
    expect(validateWebDecision('running', { decision: 'approve' })).toBeNull();
  });
});

describe('handleGateRow', () => {
  beforeEach(() => {
    resumeSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('claims the decision and resumes the run', async () => {
    fakeSupabase.__setResponse('newsletter_runs', {
      data: [{ workflow_run_id: 'run-1' }],
      error: null,
    });

    await handleGateRow({
      workflow_run_id: 'run-1',
      status: 'suspended_gate1',
      pending_decision: { decision: 'approve' },
    });

    // Claim is a conditional clear of pending_decision.
    const builder = fakeSupabase.__buildersFor('newsletter_runs')[0];
    expect(builder?.update).toHaveBeenCalledWith({ pending_decision: null });
    expect(builder?.not).toHaveBeenCalledWith('pending_decision', 'is', null);
    expect(resumeSpy).toHaveBeenCalledWith({ runId: 'run-1', resumeData: { decision: 'approve' } });
  });

  it('does not resume when the claim affects no row (already taken)', async () => {
    fakeSupabase.__setResponse('newsletter_runs', { data: [], error: null });

    await handleGateRow({
      workflow_run_id: 'run-1',
      status: 'suspended_gate2',
      pending_decision: { decision: 'publish' },
    });

    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it('ignores rows with no pending decision without touching the db', async () => {
    await handleGateRow({
      workflow_run_id: 'run-1',
      status: 'suspended_gate1',
      pending_decision: null,
    });

    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it('claims but does not resume an invalid decision', async () => {
    fakeSupabase.__setResponse('newsletter_runs', {
      data: [{ workflow_run_id: 'run-1' }],
      error: null,
    });

    await handleGateRow({
      workflow_run_id: 'run-1',
      status: 'suspended_gate1',
      pending_decision: { decision: 'publish' }, // gate-2 command at gate 1
    });

    expect(fakeSupabase.from).toHaveBeenCalledWith('newsletter_runs');
    expect(resumeSpy).not.toHaveBeenCalled();
  });
});
