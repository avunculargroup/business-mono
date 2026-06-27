import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));

const { setWorkflowProgress, clearWorkflowProgress } = await import('./workflowProgress.js');

beforeEach(() => {
  fake.__builders.length = 0;
  fake.__responses.clear();
});

describe('setWorkflowProgress', () => {
  it('upserts a row keyed by workflow_run_id', async () => {
    fake.__setResponse('workflow_progress', { data: null, error: null });
    await setWorkflowProgress('run-1', 'synthesise_strategy', 'Margot is drafting the strategy…');

    const [builder] = fake.__buildersFor('workflow_progress');
    expect(builder.upsert).toHaveBeenCalledWith(
      { workflow_run_id: 'run-1', step_id: 'synthesise_strategy', step_label: 'Margot is drafting the strategy…' },
      { onConflict: 'workflow_run_id' },
    );
  });

  it('no-ops when runId is undefined', async () => {
    await setWorkflowProgress(undefined, 'step', 'label');
    expect(fake.__buildersFor('workflow_progress')).toHaveLength(0);
  });

  it('swallows errors instead of throwing', async () => {
    fake.__setResponse('workflow_progress', { data: null, error: { message: 'boom' } });
    await expect(setWorkflowProgress('run-1', 'step', 'label')).resolves.toBeUndefined();
  });
});

describe('clearWorkflowProgress', () => {
  it('deletes the row for the run', async () => {
    fake.__setResponse('workflow_progress', { data: null, error: null });
    await clearWorkflowProgress('run-1');

    const [builder] = fake.__buildersFor('workflow_progress');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('workflow_run_id', 'run-1');
  });

  it('no-ops when runId is undefined', async () => {
    await clearWorkflowProgress(undefined);
    expect(fake.__buildersFor('workflow_progress')).toHaveLength(0);
  });

  it('swallows errors instead of throwing', async () => {
    fake.__setResponse('workflow_progress', { data: null, error: { message: 'boom' } });
    await expect(clearWorkflowProgress('run-1')).resolves.toBeUndefined();
  });
});
