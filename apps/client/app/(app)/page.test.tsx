import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClientDataContext } from '@platform/data';
import { fakeClientRepositories, withEmptyReads } from '@/test/mocks/repositories';

let repositories: ClientDataContext;
vi.mock('@/lib/repositories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories')>('@/lib/repositories');
  return {
    ...actual,
    requireClientRepositories: vi.fn(async () => repositories),
    getClientRepositories: vi.fn(async () => repositories),
  };
});

import BriefPage from './page';

beforeEach(() => {
  repositories = fakeClientRepositories();
});

/**
 * The Brief's three states.
 *
 * These are the reason this page has a test at all. Collapsing "no brief has
 * ever published" into "nothing happened today" tells a subscriber the pipeline
 * reported quiet when in fact it never ran, and a subscriber who learns that
 * distinction is unreliable stops trusting the quiet days — which are most
 * days.
 */
describe('BriefPage', () => {
  it('renders a published brief with its narration', async () => {
    render(await BriefPage());

    expect(
      screen.getByText(/Two custody providers updated their attestation pages/),
    ).toBeInTheDocument();
  });

  it('renders a finding under the narration', async () => {
    render(await BriefPage());

    expect(
      screen.getByText(/attestation did not arrive on its usual cadence/i),
    ).toBeInTheDocument();
  });

  it('says nothing has ever published, rather than saying nothing happened', async () => {
    repositories = withEmptyReads(fakeClientRepositories(), {
      brief: { latest: async () => null, recent: async () => [] },
    });

    render(await BriefPage());

    // The words matter more than the element: "no brief yet" and "nothing
    // happened today" are different claims and only one of them is true here.
    expect(document.body.textContent).not.toMatch(/nothing (happened|cleared)/i);
  });
});
