import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

// `createClient` is async in the server module; hand it our fake. The `fake`
// binding is reassigned per-test in beforeEach and only dereferenced when the
// page calls createClient(), so the hoisted factory closing over it is safe.
let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
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
  fake = createFakeSupabase();
});

describe('CompaniesPage', () => {
  it('renders the page header and the fetched companies', async () => {
    fake.__setResponse('companies', {
      data: [
        { id: '1', name: 'Acme Corp' },
        { id: '2', name: 'Globex' },
      ],
      count: 2,
      error: null,
    });

    render(await CompaniesPage());

    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByTestId('companies-list')).toHaveAttribute('data-total', '2');
  });

  it('queries the companies table ordered by name with a 25-row cap', async () => {
    render(await CompaniesPage());

    expect(fake.from).toHaveBeenCalledWith('companies');
    const [builder] = fake.__buildersFor('companies');
    expect(builder.order).toHaveBeenCalledWith('name');
    expect(builder.limit).toHaveBeenCalledWith(25);
  });

  it('falls back to an empty list and zero count when the query returns nothing', async () => {
    fake.__setResponse('companies', { data: null, count: null, error: null });

    render(await CompaniesPage());

    const list = screen.getByTestId('companies-list');
    expect(list).toHaveAttribute('data-total', '0');
    expect(list).toBeEmptyDOMElement();
  });
});
