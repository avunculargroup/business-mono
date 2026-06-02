import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// startNewsletterRun imports @platform/db and @platform/signal at module load;
// mock both so the unit under test can be imported in isolation. mastra/index is
// loaded lazily inside the resume path — mock it so resumeNewsletterRun can be
// exercised against a fake workflow snapshot without a real runtime.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const sendMessage = vi.fn();
const getWorkflowRunById = vi.fn();
const resume = vi.fn();
const createRun = vi.fn(async () => ({ resume }));

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('@platform/signal', () => ({
  SignalClient: vi.fn().mockImplementation(() => ({ sendMessage })),
}));
vi.mock('../mastra/index.js', () => ({
  mastra: { getWorkflow: () => ({ getWorkflowRunById, createRun }) },
}));

const { notifySignal, resumeNewsletterRun, extractSuspendPayload } = await import(
  './startNewsletterRun.js'
);

describe('extractSuspendPayload', () => {
  it('keys the gate off the suspended step id, not a payload.gate field', () => {
    // The reported failure mode: the runtime surfaces an empty top-level
    // suspendPayload, so the gate must come from the suspended path. A gate-1
    // suspend must read as gate 1 (it previously defaulted to gate 2).
    const payload = extractSuspendPayload({
      status: 'suspended',
      suspendPayload: {},
      suspended: [['gate1']],
      steps: { gate1: { suspendPayload: { message: 'pick stories' } } },
    });
    expect(payload).toEqual({
      gate: 'gate1',
      message: 'pick stories',
      newsletterMarkdown: undefined,
      held: undefined,
    });
  });

  it('carries the gate-2 message, markdown and hold flag through', () => {
    const payload = extractSuspendPayload({
      status: 'suspended',
      suspendPayload: {},
      suspended: [['gate2']],
      steps: {
        gate2: { suspendPayload: { message: 'final draft', newsletterMarkdown: '# md', held: true } },
      },
    });
    expect(payload).toEqual({
      gate: 'gate2',
      message: 'final draft',
      newsletterMarkdown: '# md',
      held: true,
    });
  });

  it('falls back to the top-level payload when the step record is empty', () => {
    const payload = extractSuspendPayload({
      status: 'suspended',
      suspendPayload: { message: 'from top', newsletterMarkdown: '# top' },
      suspended: [['gate2']],
      steps: { gate2: { suspendPayload: {} } },
    });
    expect(payload).toMatchObject({ gate: 'gate2', message: 'from top', newsletterMarkdown: '# top' });
  });

  it('returns null when nothing is suspended at a gate', () => {
    expect(
      extractSuspendPayload({ status: 'success', suspended: [], steps: {} }),
    ).toBeNull();
  });
});

describe('notifySignal', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('forwards the params to SignalClient.sendMessage', async () => {
    sendMessage.mockResolvedValueOnce({ timestamp: 1 });
    await notifySignal({ recipients: ['+15551234567'], message: 'hi' });
    expect(sendMessage).toHaveBeenCalledWith({ recipients: ['+15551234567'], message: 'hi' });
  });

  it('swallows a send failure so a bad recipient never aborts run handling', async () => {
    sendMessage.mockRejectedValueOnce(
      new Error('signal-cli API error 400: User +61390226516 is not registered.'),
    );
    // Must resolve, not reject — the gate notification is best-effort.
    await expect(
      notifySignal({ recipients: ['+61390226516'], message: 'gate prompt' }),
    ).resolves.toBeUndefined();
  });
});

describe('resumeNewsletterRun', () => {
  beforeEach(() => {
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
    getWorkflowRunById.mockReset();
    createRun.mockClear();
    resume.mockReset();
    sendMessage.mockReset();
    // requested_by_signal lookup + every newsletter_runs read/write share this.
    fakeSupabase.__setResponse('newsletter_runs', {
      data: { requested_by_signal: null },
      error: null,
    });
  });

  it('resumes when the snapshot gate matches the requested step', async () => {
    getWorkflowRunById.mockResolvedValueOnce({ steps: { gate1: { status: 'suspended' } } });
    resume.mockResolvedValueOnce({
      status: 'suspended',
      suspendPayload: { gate: 'gate2', message: 'final draft', newsletterMarkdown: '# md' },
    });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'approve' },
      step: 'gate1',
    });

    expect(resume).toHaveBeenCalledWith({ step: 'gate1', resumeData: { decision: 'approve' } });
    expect(out.status).toBe('suspended');
  });

  it('reconciles instead of resuming when the row drifted past the snapshot', async () => {
    // The reported bug: row says gate 2 (publish offered) but the workflow is
    // really still suspended at gate 1. Resuming gate2 would throw and wedge it.
    getWorkflowRunById.mockResolvedValueOnce({
      steps: { gate1: { status: 'suspended' }, gate2: { status: 'pending' } },
    });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'publish' },
      step: 'gate2',
    });

    expect(resume).not.toHaveBeenCalled();
    expect(out.status).toBe('reconciled_gate1');
    // The drifted row is re-synced back to gate 1 with the stale draft cleared.
    const lastUpdate = fakeSupabase
      .__buildersFor('newsletter_runs')
      .filter((b) => b.update.mock.calls.length > 0)
      .at(-1);
    expect(lastUpdate?.update).toHaveBeenCalledWith({
      status: 'suspended_gate1',
      gate_message: null,
      gate_draft_markdown: null,
      pending_decision: null,
    });
  });

  it('does nothing when the run is no longer suspended at a gate', async () => {
    getWorkflowRunById.mockResolvedValueOnce({ steps: {} });

    const out = await resumeNewsletterRun({
      runId: 'run-1',
      resumeData: { decision: 'publish' },
      step: 'gate2',
    });

    expect(resume).not.toHaveBeenCalled();
    expect(out.status).toBe('not_suspended');
  });
});
