import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { createTask, updateTaskStatus, deleteTask } from './tasks';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('createTask', () => {
  it('rejects invalid input without touching the database', async () => {
    const result = await createTask(form({ title: '' }));

    expect(result).toEqual({ error: 'Title is required' });
    expect(client.from).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('inserts a normalised row and revalidates on success', async () => {
    client.__setResponse('tasks', { data: { id: 't1', title: 'Call CFO' }, error: null });

    const result = await createTask(form({ title: 'Call CFO', priority: 'high' }));

    expect(result).toEqual({ success: true, task: { id: 't1', title: 'Call CFO' } });
    const insert = client.__buildersFor('tasks')[0].insert;
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call CFO', priority: 'high', source: 'manual' }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/tasks');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await createTask(form({ title: 'Call CFO' }));

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('updateTaskStatus', () => {
  it('sets completed_at when moving to done', async () => {
    client.__setResponse('tasks', { data: null, error: null });

    const result = await updateTaskStatus('t1', 'done');

    expect(result).toEqual({ success: true });
    const builder = client.__buildersFor('tasks')[0];
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', completed_at: expect.any(String) }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 't1');
  });

  it('clears completed_at when moving out of done', async () => {
    client.__setResponse('tasks', { data: null, error: null });

    await updateTaskStatus('t1', 'todo');

    expect(client.__buildersFor('tasks')[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'todo', completed_at: null }),
    );
  });

  it('surfaces a humane error when the update fails', async () => {
    client.__setResponse('tasks', { data: null, error: { message: 'boom' } });

    const result = await updateTaskStatus('t1', 'todo');

    expect(result).toHaveProperty('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deleteTask', () => {
  it('deletes by id and revalidates', async () => {
    client.__setResponse('tasks', { data: null, error: null });

    const result = await deleteTask('t1');

    expect(result).toEqual({ success: true });
    const builder = client.__buildersFor('tasks')[0];
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    expect(revalidatePath).toHaveBeenCalledWith('/tasks');
  });
});
