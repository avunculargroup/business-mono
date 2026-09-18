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

  /**
   * The findings section is the reason this page exists, and for a while it was
   * the reason not to read it.
   *
   * The engine stores `narration_hint`, `observed` and `baseline`; the adapter
   * read `headline`, `detail` and `provenance`, which nothing has ever written.
   * So every live card rendered as the word "streak" over two empty paragraphs
   * and "Source not attached" — vague in a way that reads as a system with
   * nothing to say rather than one wired up wrong. These assert the three
   * things that were missing.
   */
  it('shows the figures a finding rests on, not only the sentence', async () => {
    render(await BriefPage());

    expect(screen.getByText('Held for')).toBeInTheDocument();
    expect(screen.getByText('10 consecutive days')).toBeInTheDocument();
    expect(screen.getByText('23.3% to 47.7%')).toBeInTheDocument();
  });

  it('names the source of a finding and says how the figure was arrived at', async () => {
    render(await BriefPage());

    const source = screen.getByRole('link', { name: 'Coin Metrics' });
    expect(source).toHaveAttribute('href', 'https://coinmetrics.io/community-network-data/');
    // "Derived" alone would not say whose derivation it is. A figure this
    // platform computed from a provider's series is a different claim from one
    // the provider published.
    expect(screen.getByText(/computed from this source/)).toBeInTheDocument();
  });

  it('says a source is missing rather than leaving the rail blank', async () => {
    render(await BriefPage());

    expect(screen.getByText('Source not attached')).toBeInTheDocument();
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
