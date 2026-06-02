import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));

const { markStep } = await import('./progress.js');

describe('markStep', () => {
  beforeEach(() => {
    fakeSupabase.__builders.length = 0;
  });

  it('updates current_step on the matching run', async () => {
    await markStep('run-123', 'draft_generation');

    const [builder] = fakeSupabase.__buildersFor('newsletter_runs');
    expect(builder).toBeDefined();
    expect(builder!.update).toHaveBeenCalledWith({ current_step: 'draft_generation' });
    expect(builder!.eq).toHaveBeenCalledWith('workflow_run_id', 'run-123');
  });

  it('is a no-op when runId is missing', async () => {
    await markStep(undefined, 'retrieve');
    expect(fakeSupabase.__buildersFor('newsletter_runs')).toHaveLength(0);
  });

  it('swallows a write failure so progress never aborts the run', async () => {
    // Make the update chain throw, mimicking a transient DB error.
    fakeSupabase.from.mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });
    await expect(markStep('run-456', 'assemble')).resolves.toBeUndefined();
  });
});
