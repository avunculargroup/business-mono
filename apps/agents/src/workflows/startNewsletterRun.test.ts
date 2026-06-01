import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// Shared fakes wired through the module mocks below.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const getWorkflowRunById = vi.fn();
const resume = vi.fn(async () => ({ status: 'completed' }));
const createRun = vi.fn(async () => ({ resume }));

vi.mock('@platform/db', () => ({ supabase: fakeSupabase }));
vi.mock('@platform/signal', () => ({
  SignalClient: vi.fn(() => ({ sendMessage: vi.fn() })),
}));
vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow: () => ({ getWorkflowRunById, createRun }) },
}));

const { pickSuspendedGate, gateStepForStatus, resumeNewsletterRun } = await import(
  './startNewsletterRun.js'
);

describe('pickSuspendedGate', () => {
  it('returns gate1 when only gate1 is suspended', () => {
    expect(pickSuspendedGate({ gate1: { status: 'suspended' } })).toBe('gate1');
  });

  it('returns gate2 when gate1 is done and gate2 is suspended', () => {
    expect(
      pickSuspendedGate({ gate1: { status: 'success' }, gate2: { status: 'suspended' } }),
    ).toBe('gate2');
  });

  it('returns null when no gate is suspended', () => {
    expect(pickSuspendedGate({ gate1: { status: 'success' } })).toBeNull();
    expect(pickSuspendedGate({})).toBeNull();
    expect(pickSuspendedGate(undefined)).toBeNull();
  });
});

describe('gateStepForStatus', () => {
  it('maps gate1 status to the gate1 step and everything else to gate2', () => {
    expect(gateStepForStatus('suspended_gate1')).toBe('gate1');
    expect(gateStepForStatus('suspended_gate2')).toBe('gate2');
    expect(gateStepForStatus('suspended_hold')).toBe('gate2');
  });
});

describe('resumeNewsletterRun', () => {
  beforeEach(() => {
    resume.mockClear();
    createRun.mockClear();
    getWorkflowRunById.mockReset();
    fakeSupabase.__setResponse('newsletter_runs', {
      data: { requested_by_signal: null },
      error: null,
    });
  });

  it('resumes when the snapshot is suspended at the requested gate', async () => {
    getWorkflowRunById.mockResolvedValue({ steps: { gate2: { status: 'suspended' } } });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'publish' },
      step: 'gate2',
    });

    expect(resume).toHaveBeenCalledWith({ step: 'gate2', resumeData: { decision: 'publish' } });
    expect(out.status).toBe('completed');
  });

  it('skips (does not resume) when the snapshot is suspended at a different gate', async () => {
    // Stale row: status implied gate2, but the snapshot is still at gate1.
    getWorkflowRunById.mockResolvedValue({ steps: { gate1: { status: 'suspended' } } });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'publish' },
      step: 'gate2',
    });

    expect(resume).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
    expect(out.status).toBe('stale');
  });

  it('skips when the run is no longer suspended at any gate', async () => {
    getWorkflowRunById.mockResolvedValue({ steps: { gate1: { status: 'success' } } });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'approve' },
      step: 'gate1',
    });

    expect(resume).not.toHaveBeenCalled();
    expect(out.status).toBe('stale');
  });
});
