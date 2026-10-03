import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClientDataContext, ClientRegisterEntry } from '@platform/data';
import { fakeClientRepositories, withEmptyReads } from '@/test/mocks/repositories';

let repositories: ClientDataContext;
vi.mock('@/lib/repositories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories')>('@/lib/repositories');
  return { ...actual, requireClientRepositories: vi.fn(async () => repositories) };
});

import RegisterEntryPage from './page';

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  repositories = fakeClientRepositories();
});

describe('RegisterEntryPage', () => {
  it('opens with the summary written when the entry was cleared', async () => {
    render(await RegisterEntryPage(params('sample-holdings-ltd')));

    expect(screen.getByText(/under a board-approved treasury policy/)).toBeInTheDocument();
  });

  it('renders no empty summary when an entry has none', async () => {
    const [entry] = await fakeClientRepositories().register.list({} as never);
    const bare: ClientRegisterEntry = { ...entry!, summary: null };
    repositories = withEmptyReads(fakeClientRepositories(), {
      register: { list: async () => [bare], bySlug: async () => bare },
    });

    const { container } = render(await RegisterEntryPage(params(bare.slug)));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(bare.entityName);
    expect(container.textContent).not.toMatch(/board-approved treasury policy/);
  });
});
