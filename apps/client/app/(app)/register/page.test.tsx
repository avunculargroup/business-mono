import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClientDataContext } from '@platform/data';
import { fakeClientRepositories, withEmptyReads } from '@/test/mocks/repositories';

let repositories: ClientDataContext;
vi.mock('@/lib/repositories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories')>('@/lib/repositories');
  return { ...actual, requireClientRepositories: vi.fn(async () => repositories) };
});

import RegisterPage from './page';

beforeEach(() => {
  repositories = fakeClientRepositories();
});

describe('RegisterPage', () => {
  it('lists a cleared entry by name', async () => {
    render(await RegisterPage());

    expect(screen.getByText('Sample Holdings Ltd')).toBeInTheDocument();
  });

  it('shows no holdings figure on the list', async () => {
    // A list of names with quantities beside them invites exactly the
    // comparison the register rules forbid. The position lives on the entry,
    // where it arrives with its basis and its date.
    render(await RegisterPage());

    expect(document.body.textContent).not.toMatch(/\bBTC\b|\bbitcoin held\b/i);
  });

  it('has a quiet state rather than an empty page', async () => {
    repositories = withEmptyReads(fakeClientRepositories(), {
      register: { list: async () => [] },
    });

    render(await RegisterPage());

    expect(document.body.textContent?.trim().length).toBeGreaterThan(0);
  });
});
