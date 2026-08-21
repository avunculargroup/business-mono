import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakeRepositories,
  fakeCompanySummary,
  type FakeRepositories,
} from '@/test/mocks/repositories';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

// Converted to the seam in vertical 4.6a. Column mapping — including the
// `source: 'web'` stamp this file used to assert — is verified once in
// @platform/data-supabase; what is left here is the form's business: what
// validates, what a partial edit carries, and what gets revalidated.
let repositories: FakeRepositories;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedRepositories: vi.fn(async () =>
    authed
      ? { ok: true, repositories, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import { createCompany, updateCompany, deleteCompany } from './companies';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  repositories = createFakeRepositories();
  authed = true;
  revalidatePath.mockClear();
});

describe('createCompany', () => {
  it('rejects a missing name without touching the repository', async () => {
    const result = await createCompany(form({ name: '' }));

    expect(result).toEqual({ error: 'Company name is required' });
    expect(repositories.companies.createCompany).not.toHaveBeenCalled();
  });

  it('rejects a malformed website url', async () => {
    const result = await createCompany(form({ name: 'Acme', website: 'not-a-url' }));

    expect(result).toHaveProperty('error');
    expect(repositories.companies.createCompany).not.toHaveBeenCalled();
  });

  it('stores blank optional fields as null rather than empty strings', async () => {
    // A blank input is "not given". Storing '' would make an empty website
    // render as a link to nowhere.
    await createCompany(form({ name: 'Acme', website: '', notes: '' }));

    expect(repositories.companies.createCompany).toHaveBeenCalledWith({
      name: 'Acme',
      industry: null,
      size: null,
      website: null,
      linkedinUrl: null,
      notes: null,
    });
  });

  it('hands the created company back for the list to render', async () => {
    // CompanyForm passes this straight to the list, which links by slug — a
    // create that returned nothing would leave a row that cannot be opened.
    repositories.companies.createCompany.mockResolvedValueOnce(
      fakeCompanySummary({ id: 'c1', name: 'Acme', slug: 'acme' }),
    );

    const result = await createCompany(form({ name: 'Acme' }));

    expect(result).toMatchObject({ success: true, company: { id: 'c1', slug: 'acme' } });
    expect(revalidatePath).toHaveBeenCalledWith('/crm/companies');
  });

  it('surfaces a write failure instead of reporting success', async () => {
    repositories.companies.createCompany.mockRejectedValueOnce(new Error('duplicate key'));

    expect(await createCompany(form({ name: 'Acme' }))).toHaveProperty('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the auth error when signed out', async () => {
    authed = false;

    expect(await createCompany(form({ name: 'Acme' }))).toEqual({
      error: 'You need to be signed in to do that.',
    });
    expect(repositories.companies.createCompany).not.toHaveBeenCalled();
  });
});

describe('updateCompany', () => {
  it('only sends provided, non-empty fields', async () => {
    // A field the form did not render, or left blank, is left alone rather than
    // cleared — the app's one update strategy, and the reason the edit type is
    // a partial.
    await updateCompany('c1', form({ name: 'Acme Co', industry: '' }));

    expect(repositories.companies.updateCompany).toHaveBeenCalledWith('c1', {
      name: 'Acme Co',
    });
  });

  it('renames linkedin_url to the read model field', async () => {
    await updateCompany('c1', form({ linkedin_url: 'https://linkedin.test/acme' }));

    expect(repositories.companies.updateCompany).toHaveBeenCalledWith('c1', {
      linkedinUrl: 'https://linkedin.test/acme',
    });
  });

  it('surfaces a write failure instead of reporting success', async () => {
    repositories.companies.updateCompany.mockRejectedValueOnce(new Error('offline'));

    expect(await updateCompany('c1', form({ name: 'Acme Co' }))).toHaveProperty('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deleteCompany', () => {
  it('deletes by id and revalidates', async () => {
    const result = await deleteCompany('c1');

    expect(result).toEqual({ success: true });
    expect(repositories.companies.deleteCompany).toHaveBeenCalledWith('c1');
    expect(revalidatePath).toHaveBeenCalledWith('/crm/companies');
  });

  it('surfaces a delete failure', async () => {
    repositories.companies.deleteCompany.mockRejectedValueOnce(new Error('foreign key'));

    expect(await deleteCompany('c1')).toHaveProperty('error');
  });
});
