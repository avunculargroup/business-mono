import { beforeEach, describe, expect, it } from 'vitest';
import { testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

let client: FakeSupabaseClient;

function companies() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .companies;
}

const companyRow = {
  id: 'co-1',
  slug: 'acme-corp',
  name: 'Acme Corp',
  industry: 'Mining',
  size: 'SME',
  website: 'https://acme.test',
  linkedin_url: null,
  notes: null,
  created_at: '2026-08-19T00:00:00Z',
};

const contactRow = {
  id: 'ct-1',
  slug: 'jane-doe',
  first_name: 'Jane',
  last_name: 'Doe',
  pipeline_stage: 'lead',
  email: 'jane@acme.test',
};

beforeEach(() => {
  client = createFakeSupabase();
  client.__setResponse('companies', { data: [companyRow], count: 1, error: null });
  client.__setResponse('contacts', { data: [contactRow], error: null });
});

describe('listCompanies', () => {
  it('camel-cases the row and reports the total separately from the page', async () => {
    client.__setResponse('companies', { data: [companyRow], count: 40, error: null });

    const result = await companies().listCompanies(ctx);

    expect(result.items[0]).toEqual({
      id: 'co-1',
      slug: 'acme-corp',
      name: 'Acme Corp',
      industry: 'Mining',
      size: 'SME',
      website: 'https://acme.test',
      linkedinUrl: null,
      notes: null,
      createdAt: '2026-08-19T00:00:00Z',
    });
    expect(result).toMatchObject({ total: 40, hasMore: true });
  });

  it('orders by name and caps the page at 25', async () => {
    await companies().listCompanies(ctx);

    const [builder] = client.__buildersFor('companies');
    expect(builder.order).toHaveBeenCalledWith('name');
    expect(builder.limit).toHaveBeenCalledWith(25);
  });

  it('honours a caller-supplied limit', async () => {
    await companies().listCompanies(ctx, { limit: 5 });

    expect(client.__buildersFor('companies')[0].limit).toHaveBeenCalledWith(5);
  });

  it('falls back to the page length when the count comes back null', async () => {
    // A missing count must not read as "no companies" under a list that has
    // rows in it.
    client.__setResponse('companies', { data: [companyRow], count: null, error: null });

    expect(await companies().listCompanies(ctx)).toMatchObject({ total: 1, hasMore: false });
  });

  it('throws rather than showing an empty list on error', async () => {
    client.__setResponse('companies', { data: null, count: null, error: { message: 'boom' } });

    await expect(companies().listCompanies(ctx)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('getCompany', () => {
  beforeEach(() => {
    client.__setResponse('companies', { data: companyRow, error: null });
  });

  it('matches a slug on the slug column', async () => {
    const company = await companies().getCompany(ctx, 'acme-corp');

    expect(client.__buildersFor('companies')[0].eq).toHaveBeenCalledWith('slug', 'acme-corp');
    expect(company).toEqual({
      id: 'co-1',
      slug: 'acme-corp',
      name: 'Acme Corp',
      industry: 'Mining',
      size: 'SME',
      website: 'https://acme.test',
      notes: null,
    });
  });

  it('matches a UUID on the id column', async () => {
    // Both forms of link are live in the app, so both have to resolve. Getting
    // this wrong turns an existing company into a 404.
    await companies().getCompany(ctx, '11111111-1111-4111-8111-111111111111');

    expect(client.__buildersFor('companies')[0].eq).toHaveBeenCalledWith(
      'id',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('returns null for a company that is gone', async () => {
    client.__setResponse('companies', { data: null, error: null });

    expect(await companies().getCompany(ctx, 'nope')).toBeNull();
  });

  it('throws on a read failure rather than reporting the company gone', async () => {
    client.__setResponse('companies', { data: null, error: { message: 'offline' } });

    await expect(companies().getCompany(ctx, 'acme-corp')).rejects.toMatchObject({
      message: 'offline',
    });
  });
});

describe('listCompanyContacts', () => {
  it('camel-cases the contacts and scopes them to the company', async () => {
    const contacts = await companies().listCompanyContacts(ctx, 'co-1');

    expect(contacts).toEqual([
      {
        id: 'ct-1',
        slug: 'jane-doe',
        firstName: 'Jane',
        lastName: 'Doe',
        pipelineStage: 'lead',
        email: 'jane@acme.test',
      },
    ]);
    expect(client.__buildersFor('contacts')[0].eq).toHaveBeenCalledWith('company_id', 'co-1');
  });
});

describe('listCompanyOptions', () => {
  it('returns id and name only, ordered by name', async () => {
    // This is a picklist. Selecting the whole row here would ship every
    // company's notes to every form that offers the dropdown.
    const options = await companies().listCompanyOptions(ctx);

    const [builder] = client.__buildersFor('companies');
    expect(builder.select).toHaveBeenCalledWith('id, name');
    expect(builder.order).toHaveBeenCalledWith('name');
    expect(options).toEqual([{ id: 'co-1', name: 'Acme Corp' }]);
  });
});

describe('createCompany', () => {
  beforeEach(() => {
    client.__setResponse('companies', { data: companyRow, error: null });
  });

  it('maps the input onto its columns, stamps the source, and returns the row', async () => {
    const company = await companies().createCompany({
      name: 'Acme Corp',
      industry: 'Mining',
      size: 'SME',
      website: 'https://acme.test',
      linkedinUrl: null,
      notes: null,
    });

    expect(client.__buildersFor('companies')[0].insert).toHaveBeenCalledWith({
      name: 'Acme Corp',
      industry: 'Mining',
      size: 'SME',
      website: 'https://acme.test',
      linkedin_url: null,
      notes: null,
      source: 'web',
    });
    // The slug is the whole reason the create returns a row: every link into a
    // company goes through it, so a create that dropped it would leave the list
    // with a row it cannot navigate to.
    expect(company.slug).toBe('acme-corp');
  });

  it('throws when the insert fails instead of returning a half-made company', async () => {
    client.__setResponse('companies', { data: null, error: { message: 'duplicate' } });

    await expect(
      companies().createCompany({
        name: 'Acme Corp',
        industry: null,
        size: null,
        website: null,
        linkedinUrl: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ message: 'duplicate' });
  });
});

describe('updateCompany', () => {
  it('writes only the fields the edit carried', async () => {
    // An absent key means "leave it alone", which is not the same as null. A
    // blanket write would clear every field the form did not render.
    await companies().updateCompany('co-1', { name: 'Acme Ltd' });

    const [update] = client.__buildersFor('companies')[0].update.mock.calls[0];
    expect(update).toEqual({ name: 'Acme Ltd' });
    expect(client.__buildersFor('companies')[0].eq).toHaveBeenCalledWith('id', 'co-1');
  });

  it('does write an explicit null, which is how a field gets cleared', async () => {
    await companies().updateCompany('co-1', { notes: null });

    const [update] = client.__buildersFor('companies')[0].update.mock.calls[0];
    expect(update).toEqual({ notes: null });
  });

  it('never writes the source column', async () => {
    // `source` records which surface produced the row. An edit does not change
    // where it came from.
    await companies().updateCompany('co-1', { name: 'Acme Ltd', notes: 'Edited.' });

    const [update] = client.__buildersFor('companies')[0].update.mock.calls[0];
    expect(update).not.toHaveProperty('source');
  });
});

describe('deleteCompany', () => {
  it('deletes the addressed company', async () => {
    await companies().deleteCompany('co-1');

    const builder = client.__buildersFor('companies')[0];
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'co-1');
  });
});
