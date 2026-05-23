import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));

const { logActivity } = await import('./activity.js');

describe('logActivity tool', () => {
  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
  });

  it('inserts an agent_activity row with the expected shape', async () => {
    fake.__setResponse('agent_activity', { data: { id: 'act_001' }, error: null });

    const result = await logActivity.execute!(
      {
        agentName: 'simon',
        action: 'Did the thing',
        status: 'auto',
        triggerType: 'manual',
        workflowRunId: 'wf_1',
        entityType: 'contact',
        entityId: 'c1',
        proposedActions: [{ a: 1 }],
        approvedActions: [{ b: 2 }],
        notes: 'all good',
      } as never,
      {} as never,
    );

    expect(result).toEqual({ activityId: 'act_001' });

    const builder = fake.__buildersFor('agent_activity')[0];
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: 'simon',
        action: 'Did the thing',
        status: 'auto',
        trigger_type: 'manual',
        workflow_run_id: 'wf_1',
        entity_type: 'contact',
        entity_id: 'c1',
        proposed_actions: [{ a: 1 }],
        approved_actions: [{ b: 2 }],
        notes: 'all good',
      }),
    );
  });

  it('defaults optional fields to null', async () => {
    fake.__setResponse('agent_activity', { data: { id: 'act_002' }, error: null });
    await logActivity.execute!(
      { agentName: 'rex', action: 'minimal', status: 'auto' } as never,
      {} as never,
    );
    const builder = fake.__buildersFor('agent_activity')[0];
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: null,
        workflow_run_id: null,
        entity_type: null,
        entity_id: null,
        proposed_actions: null,
        approved_actions: null,
        clarifications: null,
        notes: null,
      }),
    );
  });

  it('throws when supabase reports an error', async () => {
    fake.__setResponse('agent_activity', { data: null, error: { message: 'rls denied' } });
    await expect(
      logActivity.execute!(
        { agentName: 'rex', action: 'x', status: 'auto' } as never,
        {} as never,
      ),
    ).rejects.toThrow(/Failed to log activity: rls denied/);
  });
});
