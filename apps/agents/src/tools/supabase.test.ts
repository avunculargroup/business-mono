import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fake = createFakeSupabase();

vi.mock('@platform/db', () => ({
  get supabase() { return fake; },
}));

// Import after mock so the tools pick up our fake.
const { supabaseQuery, supabaseInsert, supabaseUpdate } = await import('./supabase.js');

async function execute(tool: { execute?: (...args: unknown[]) => unknown }, input: Record<string, unknown>): Promise<unknown> {
  // Mastra calls `execute(context)` where context is the input object directly,
  // matching the signature used in this codebase. Some Mastra builds pass
  // `{ context }` instead — support both for forward-compat.
  const direct = tool.execute!(input, {} as never);
  // If the tool was using `{ context }`, every field would be undefined and the
  // call would have thrown trying to read `.table`. We catch nothing here —
  // just delegate.
  return direct;
}

describe('supabaseQuery tool', () => {
  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
  });

  it('selects + filters + orders + limits and returns rows', async () => {
    fake.__setResponse('contacts', {
      data: [{ id: 'c1', email: 'a@b.com' }],
      error: null,
    });

    const result = await execute(supabaseQuery as never, {
      table: 'contacts',
      select: 'id, email',
      filters: { pipeline_stage: 'lead', is_active: true },
      orderBy: 'created_at',
      ascending: true,
      limit: 5,
    });

    expect(result).toEqual({ rows: [{ id: 'c1', email: 'a@b.com' }] });

    const builder = fake.__buildersFor('contacts')[0];
    expect(builder.select).toHaveBeenCalledWith('id, email');
    expect(builder.eq).toHaveBeenCalledWith('pipeline_stage', 'lead');
    expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it('returns an empty rows array when supabase returns null data', async () => {
    fake.__setResponse('empty_table', { data: null, error: null });
    const result = await execute(supabaseQuery as never, { table: 'empty_table', select: '*' });
    expect(result).toEqual({ rows: [] });
  });

  it('throws when supabase returns an error', async () => {
    fake.__setResponse('broken', { data: null, error: { message: 'permission denied' } });
    await expect(
      execute(supabaseQuery as never, { table: 'broken', select: '*' }),
    ).rejects.toThrow(/Query failed: permission denied/);
  });

  it('omits order/limit clauses when not requested', async () => {
    fake.__setResponse('contacts', { data: [], error: null });
    await execute(supabaseQuery as never, { table: 'contacts', select: '*' });
    const builder = fake.__buildersFor('contacts')[0];
    expect(builder.order).not.toHaveBeenCalled();
    expect(builder.limit).not.toHaveBeenCalled();
  });
});

describe('supabaseInsert tool', () => {
  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
  });

  it('inserts and returns the created record', async () => {
    fake.__setResponse('routines', {
      data: { id: 'r1', name: 'Daily news' },
      error: null,
    });

    const result = await execute(supabaseInsert as never, {
      table: 'routines',
      record: { name: 'Daily news', frequency: 'daily' },
    });

    expect(result).toEqual({ record: { id: 'r1', name: 'Daily news' } });
    const builder = fake.__buildersFor('routines')[0];
    expect(builder.insert).toHaveBeenCalledWith({ name: 'Daily news', frequency: 'daily' });
    expect(builder.__terminalCalls).toContain('single');
  });

  it('throws when insert errors', async () => {
    fake.__setResponse('routines', { data: null, error: { message: 'constraint violation' } });
    await expect(
      execute(supabaseInsert as never, { table: 'routines', record: {} }),
    ).rejects.toThrow(/Insert failed: constraint violation/);
  });
});

describe('supabaseUpdate tool', () => {
  beforeEach(() => {
    fake.__builders.length = 0;
    fake.__responses.clear();
    fake.from.mockClear();
  });

  it('updates by id and returns the row', async () => {
    fake.__setResponse('contacts', { data: { id: 'c1', email: 'new@x.com' }, error: null });
    const result = await execute(supabaseUpdate as never, {
      table: 'contacts',
      id: 'c1',
      updates: { email: 'new@x.com' },
    });
    expect(result).toEqual({ record: { id: 'c1', email: 'new@x.com' } });
    const builder = fake.__buildersFor('contacts')[0];
    expect(builder.update).toHaveBeenCalledWith({ email: 'new@x.com' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws when update errors', async () => {
    fake.__setResponse('contacts', { data: null, error: { message: 'row not found' } });
    await expect(
      execute(supabaseUpdate as never, { table: 'contacts', id: 'missing', updates: {} }),
    ).rejects.toThrow(/Update failed: row not found/);
  });
});
