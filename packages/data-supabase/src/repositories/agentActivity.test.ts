import { beforeEach, describe, expect, it } from 'vitest';
import {
  describeBundleContract,
  expectDescendingBy,
  expectPaginationContract,
  testReadContext,
} from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function repositories() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    agent_name: 'simon',
    action: 'Web directive: draft a post',
    status: 'pending',
    trigger_type: 'manual',
    created_at: '2026-08-19T00:00:00Z',
    entity_id: null,
    entity_type: null,
    notes: null,
    parent_activity_id: null,
    proposed_actions: null,
    approved_actions: null,
    approved_by: null,
    workflow_run_id: null,
    updated_at: '2026-08-19T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  client = createFakeSupabase();
});

describeBundleContract({
  name: 'supabase',
  expectedMode: 'live',
  createBundle: () => createSupabaseRepositories({} as PlatformSupabaseClient, principal),
});

describe('listActivity', () => {
  it('satisfies the pagination contract', async () => {
    client.__setRows('agent_activity', [
      row({ id: 'c', created_at: '2026-08-19T00:00:00Z' }),
      row({ id: 'b', created_at: '2026-08-18T00:00:00Z' }),
      row({ id: 'a', created_at: '2026-08-17T00:00:00Z' }),
    ]);

    await expectPaginationContract(
      (readCtx, opts) => repositories().agentActivity.listActivity(readCtx, undefined, opts),
      { total: 3, ctx },
    );
  });

  it('orders newest first and pushes the sort into the query', async () => {
    client.__setRows('agent_activity', [
      row({ id: 'c', created_at: '2026-08-19T00:00:00Z' }),
      row({ id: 'b', created_at: '2026-08-18T00:00:00Z' }),
    ]);

    const page = await repositories().agentActivity.listActivity(ctx);

    expectDescendingBy(page.items, 'createdAt');
    // Sorting client-side would look right in a demo and fall over at scale, so
    // the ordering has to be in the query, not in the mapping.
    expect(client.__buildersFor('agent_activity')[0].order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('reads 25 rows by default, matching the page it replaces', async () => {
    client.__setRows('agent_activity', [row()]);

    await repositories().agentActivity.listActivity(ctx);

    expect(client.__buildersFor('agent_activity')[0].range).toHaveBeenCalledWith(0, 24);
  });

  it('pushes status and agent filters into the query', async () => {
    client.__setRows('agent_activity', [row()]);

    await repositories().agentActivity.listActivity(ctx, {
      status: ['pending'],
      agentName: ['simon', 'petra'],
    });

    const builder = client.__buildersFor('agent_activity')[0];
    expect(builder.in).toHaveBeenCalledWith('status', ['pending']);
    expect(builder.in).toHaveBeenCalledWith('agent_name', ['simon', 'petra']);
  });

  it('omits empty filters rather than sending an empty IN list', async () => {
    client.__setRows('agent_activity', [row()]);

    await repositories().agentActivity.listActivity(ctx, { status: [], agentName: [] });

    expect(client.__buildersFor('agent_activity')[0].in).not.toHaveBeenCalled();
  });

  it('throws the query error rather than returning an empty page', async () => {
    client.__setResponse('agent_activity', { data: null, error: { message: 'boom' } });

    await expect(repositories().agentActivity.listActivity(ctx)).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('the proposed_actions mapping', () => {
  // These are the shapes really written today, copied from their producers. If
  // one of them stops mapping to something a human can read, this is where it
  // should be noticed — not on the page.
  it.each([
    // apps/agents/src/agents/recorder/workflow.ts — CRM entities
    [{ type: 'company', name: 'Acme Pty Ltd', action: 'create', confidence: 0.9 },
     { type: 'company', label: 'Acme Pty Ltd' }],
    // apps/agents/src/agents/recorder/workflow.ts — tasks
    [{ type: 'create_task', title: 'Follow up on the letter', due_date: null, assignee: null },
     { type: 'create_task', label: 'Follow up on the letter' }],
    // apps/agents/src/workflows/variant/index.ts
    [{ type: 'variant', platform: 'linkedin', is_thread: false },
     { type: 'variant', label: null }],
    // apps/agents/src/workflows/socialPost/index.ts
    [{ type: 'social_post', platform: 'x', is_thread: true, story_id: 's1' },
     { type: 'social_post', label: null }],
    [{ type: 'compliance', classification: 'general_advice', needs_disclaimer: true },
     { type: 'compliance', label: null }],
    // apps/agents/src/workflows/podcastIntel/index.ts
    [{ type: 'episode_summary' }, { type: 'episode_summary', label: null }],
    // apps/agents/src/agents/compliance/index.ts — note `kind`, not `type`
    [{ kind: 'suggested_rewrite', body: 'a neutral rewording' },
     { type: 'suggested_rewrite', label: null }],
    // A producer that adopts `description` later gets it for free
    [{ type: 'create_task', description: 'Chase the signature' },
     { type: 'create_task', label: 'Chase the signature' }],
  ])('maps %o', async (stored, expected) => {
    client.__setRows('agent_activity', [row({ proposed_actions: [stored] })]);

    const [item] = (await repositories().agentActivity.listActivity(ctx)).items;

    expect(item.proposedActions).toEqual([expected]);
  });

  it('keeps entries that carry neither a type nor a label, so the count stays honest', async () => {
    client.__setRows('agent_activity', [row({ proposed_actions: [{ confidence: 0.4 }] })]);

    const [item] = (await repositories().agentActivity.listActivity(ctx)).items;

    expect(item.proposedActions).toEqual([{ type: null, label: null }]);
  });

  it('treats a malformed blob as no proposed actions instead of throwing', async () => {
    client.__setRows('agent_activity', [
      row({ proposed_actions: 'not an array' }),
      row({ id: 'a2', proposed_actions: [null, 42, ['nested']] }),
      // app/actions/champions.ts and pipeline.ts store a bare object rather
      // than an array. Flagged, not fixed — changing what a producer writes
      // belongs to that producer's vertical.
      row({ id: 'a3', proposed_actions: { agent: 'simon', message: 'relay this' } }),
    ]);

    const { items } = await repositories().agentActivity.listActivity(ctx);

    expect(items.map((i) => i.proposedActions)).toEqual([[], [], []]);
  });
});

describe('the approved_actions mapping', () => {
  it('flattens to the first recorded response', async () => {
    client.__setRows('agent_activity', [
      row({ approved_actions: [{ approved: true }, { response: 'the draft' }] }),
    ]);

    const [item] = (await repositories().agentActivity.listActivity(ctx)).items;

    expect(item.approvedResponse).toBe('the draft');
  });

  it('is null when nothing carries a response', async () => {
    client.__setRows('agent_activity', [row({ approved_actions: [{ approved: true }] })]);

    const [item] = (await repositories().agentActivity.listActivity(ctx)).items;

    expect(item.approvedResponse).toBeNull();
  });
});

describe('countPending', () => {
  it('counts without reading the rows', async () => {
    client.__setResponse('agent_activity', { data: null, count: 4, error: null });

    const count = await repositories().agentActivity.countPending(ctx);

    expect(count).toBe(4);
    const builder = client.__buildersFor('agent_activity')[0];
    expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
    expect(builder.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('reads a null count as zero', async () => {
    client.__setResponse('agent_activity', { data: null, count: null, error: null });

    expect(await repositories().agentActivity.countPending(ctx)).toBe(0);
  });
});

describe('approveActivity', () => {
  it('writes the decision and the response note', async () => {
    client.__setResponse('agent_activity', { data: null, error: null });

    await repositories().agentActivity.approveActivity('a1', 'approved', 'looks good');

    const builder = client.__buildersFor('agent_activity')[0];
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', notes: 'looks good' }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'a1');
  });

  it('stores null notes when no response is given', async () => {
    client.__setResponse('agent_activity', { data: null, error: null });

    await repositories().agentActivity.approveActivity('a1', 'rejected');

    expect(client.__buildersFor('agent_activity')[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', notes: null }),
    );
  });

  it('throws so the caller can humanise the failure', async () => {
    client.__setResponse('agent_activity', { data: null, error: { message: 'nope' } });

    await expect(
      repositories().agentActivity.approveActivity('a1', 'approved'),
    ).rejects.toMatchObject({ message: 'nope' });
  });
});
