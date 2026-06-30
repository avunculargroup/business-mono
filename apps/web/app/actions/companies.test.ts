import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { createCompany, updateCompany, deleteCompany } from './companies';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  client = createFakeSupabase();
  revalidatePath.mockClear();
});

describe('createCompany', () => {
  it('rejects a missing name without touching the database', async () => {
    const result = await createCompany(form({ name: '' }));

    expect(result).toEqual({ error: 'Company name is required' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects a malformed website url', async () => {
    const result = await createCompany(form({ name: 'Acme', website: 'not-a-url' }));

    expect(result).toHaveProperty('error');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('inserts the company and revalidates on success', async () => {
    client.__setResponse('companies', { data: { id: 'c1', name: 'Acme' }, error: null });

    const result = await createCompany(form({ name: 'Acme', website: 'https://acme.example' }));

    expect(result).toEqual({ success: true, company: { id: 'c1', name: 'Acme' } });
    expect(client.__buildersFor('companies')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme', website: 'https://acme.example', source: 'web' }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/crm/companies');
  });

  it('returns the auth error when signed out', async () => {
    client.__setUser(null);

    const result = await createCompany(form({ name: 'Acme' }));

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('updateCompany', () => {
  it('only writes provided, non-empty fields', async () => {
    client.__setResponse('companies', { data: null, error: null });

    await updateCompany('c1', form({ name: 'Acme Co', industry: '' }));

    const builder = client.__buildersFor('companies')[0];
    expect(builder.update).toHaveBeenCalledWith({ name: 'Acme Co' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('deleteCompany', () => {
  it('deletes by id and revalidates', async () => {
    client.__setResponse('companies', { data: null, error: null });

    const result = await deleteCompany('c1');

    expect(result).toEqual({ success: true });
    expect(client.__buildersFor('companies')[0].delete).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/crm/companies');
  });
});
