import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClientDataContext } from '@platform/data';
import { fakeClientRepositories, withEmptyReads } from '@/test/mocks/repositories';

let repositories: ClientDataContext;
vi.mock('@/lib/repositories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories')>('@/lib/repositories');
  return { ...actual, requireClientRepositories: vi.fn(async () => repositories) };
});

// Reads IndexedDB on mount, which is the device half of the page and not what
// any of this is about.
vi.mock('./LocalPacks', () => ({ LocalPacks: () => null }));

import PreparePage from './page';

describe('PreparePage', () => {
  beforeEach(() => {
    repositories = fakeClientRepositories();
  });

  it('lists a published template', async () => {
    render(await PreparePage());

    const templates = await repositories.prepare.templates(
      { asOf: new Date() },
      'corporate',
    );
    expect(templates.length).toBeGreaterThan(0);
    expect(screen.getByText(templates[0]!.title)).toBeInTheDocument();
  });

  /**
   * The empty state has to say the list is scoped to the fund type.
   *
   * Two templates were live and a trustee's `/prepare` was empty, because both
   * were `client_type = 'corporate'` and the RLS policy will not show a trustee
   * a corporate template. The page said "No templates are available yet", which
   * is true of what the session can see and reads as a broken feature. Naming
   * the scope is the whole fix, and it is worth a test because the copy is the
   * only thing carrying it.
   */
  it('names the fund type when nothing is live for a trustee', async () => {
    repositories = withEmptyReads(fakeClientRepositories('smsf'), {
      prepare: { templates: async () => [] },
    });

    render(await PreparePage());

    expect(screen.getByText(/no templates are available yet/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/self-managed fund/i);
  });

  it('names the fund type when nothing is live for a company', async () => {
    repositories = withEmptyReads(fakeClientRepositories('corporate'), {
      prepare: { templates: async () => [] },
    });

    render(await PreparePage());

    expect(document.body.textContent).toMatch(/none is live for a company/i);
  });
});
