import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeCompanySummary,
  type FakeRepositories,
} from '@/test/mocks/repositories';

// Converted to the seam in vertical 4.6a. The page asks a repository instead of
// building a query, so the test hands it a bundle rather than a Supabase fake.
// What it asserts is unchanged — the read it makes and what it hands the list —
// but the query itself is verified once, in @platform/data-supabase.
let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

// Stub the client child so the test stays a unit on the page's data wiring,
// not CompaniesList's interactive internals (router, server actions, toasts).
vi.mock('@/components/crm/CompaniesList', () => ({
  CompaniesList: ({
    initialCompanies,
    totalCount,
  }: {
    initialCompanies: Array<{ id: string; name: string }>;
    totalCount: number;
  }) => (
    <div data-testid="companies-list" data-total={totalCount}>
      {initialCompanies.map((c) => (
        <div key={c.id}>{c.name}</div>
      ))}
    </div>
  ),
}));

// Imported after the mocks above are registered (vi.mock is hoisted).
import CompaniesPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('CompaniesPage', () => {
  it('renders the page header and the companies the repository returned', async () => {
    repositories = createFakeRepositories({
      companies: [
        fakeCompanySummary({ id: '1', name: 'Acme Corp' }),
        fakeCompanySummary({ id: '2', name: 'Globex', slug: 'globex' }),
      ],
    });

    render(await CompaniesPage());

    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByTestId('companies-list')).toHaveAttribute('data-total', '2');
  });

  it('hands the list the repository total, not the page it received', async () => {
    // The two differ as soon as there are more companies than one page holds,
    // and the count is what tells the user so.
    repositories.companies.listCompanies.mockResolvedValueOnce({
      items: [fakeCompanySummary()],
      total: 40,
      hasMore: true,
    });

    render(await CompaniesPage());

    expect(screen.getByTestId('companies-list')).toHaveAttribute('data-total', '40');
  });

  it('renders an empty list rather than failing when there are no companies', async () => {
    render(await CompaniesPage());

    const list = screen.getByTestId('companies-list');
    expect(list).toHaveAttribute('data-total', '0');
    expect(list).toBeEmptyDOMElement();
  });
});
