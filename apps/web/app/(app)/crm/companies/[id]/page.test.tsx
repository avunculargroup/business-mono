import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeCompany,
  fakeCompanyContact,
  type FakeRepositories,
} from '@/test/mocks/repositories';

let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => ({ notFound }));

import CompanyDetailPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
  notFound.mockClear();
});

function renderPage(id = 'acme-corp') {
  return CompanyDetailPage({ params: Promise.resolve({ id }) });
}

describe('CompanyDetailPage', () => {
  it('renders the company and its contacts', async () => {
    repositories = createFakeRepositories({
      companyContacts: [fakeCompanyContact({ firstName: 'Jane', lastName: 'Doe' })],
    });

    render(await renderPage());

    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
  });

  it('passes the route param through untouched, slug or UUID', async () => {
    // Which column it addresses is the adapter's decision. A page that decided
    // here would be a page that knows how rows are stored.
    await renderPage('acme-corp');
    expect(repositories.companies.getCompany).toHaveBeenCalledWith(
      expect.anything(),
      'acme-corp',
    );
  });

  it('looks up contacts by the resolved id, not the route param', async () => {
    // The param may be a slug; the contacts FK is a UUID. Passing the param
    // straight through would return no contacts and look like an empty company.
    repositories = createFakeRepositories({ company: fakeCompany({ id: 'co-9' }) });

    await renderPage('acme-corp');

    expect(repositories.companies.listCompanyContacts).toHaveBeenCalledWith(
      expect.anything(),
      'co-9',
    );
  });

  it('404s on a company that does not exist', async () => {
    repositories = createFakeRepositories({ company: null });

    await expect(renderPage('nope')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(repositories.companies.listCompanyContacts).not.toHaveBeenCalled();
  });

  it('says so when a company has no contacts', async () => {
    render(await renderPage());

    expect(screen.getByText('No contacts at this company.')).toBeInTheDocument();
  });
});
