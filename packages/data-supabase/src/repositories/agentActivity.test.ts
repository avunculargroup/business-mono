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
  it('reads the recorder shape and counts every entry', async () => {
    client.__setRows('agent_activity', [
      row({
        proposed_actions: [
          { description: 'Update contact', entity_type: 'contacts', entity_id: 'c1' },
          { type: 'variant', platform: 'linkedin' },
        ],
      }),
    ]);

    const [item] = (await repositories().agentActivity.listActivity(ctx)).items;

    expect(item.proposedActions).toEqual([
      { description: 'Update contact', entityType: 'contacts', entityId: 'c1' },
      // Six producers write six shapes into this column; only the recorder's
      // carries `description`. The entry still has to survive the mapping,
      // because the compact card renders a count of them.
      { description: null, entityType: null, entityId: null },
    ]);
  });

  it('treats a malformed blob as no proposed actions instead of throwing', async () => {
    client.__setRows('agent_activity', [
      row({ proposed_actions: 'not an array' }),
      row({ id: 'a2', proposed_actions: [null, 42, ['nested']] }),
    ]);

    const { items } = await repositories().agentActivity.listActivity(ctx);

    expect(items[0].proposedActions).toEqual([]);
    expect(items[1].proposedActions).toEqual([]);
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
