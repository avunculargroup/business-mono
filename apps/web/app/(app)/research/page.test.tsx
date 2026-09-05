import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeRegisterEntry,
  type FakeRepositories,
} from '@/test/mocks/repositories';

let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

import ResearchRegisterPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('ResearchRegisterPage', () => {
  it('groups records by tier rather than ranking them', async () => {
    // Not a leaderboard. Tiers are unequal in depth and non-comparable, so they
    // are separate lists rather than a sortable column.
    repositories = createFakeRepositories({
      register: [
        fakeRegisterEntry({ id: '1', slug: 'a', legalName: 'Meridian Freight', tier: 'regional' }),
        fakeRegisterEntry({ id: '2', slug: 'b', legalName: 'Nyala Payments', tier: 'bellwether' }),
      ],
    });

    render(await ResearchRegisterPage());

    expect(screen.getByRole('heading', { name: 'Regional register' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bellwethers' })).toBeInTheDocument();
    expect(screen.getByText('Meridian Freight')).toBeInTheDocument();
    expect(screen.getByText('Nyala Payments')).toBeInTheDocument();
  });

  it('states no holdings quantity anywhere', async () => {
    // The design decision the whole section rests on. A figure without its
    // basis and its source is worse than no figure, and neither fits on a list
    // row — so the list carries none.
    repositories = createFakeRepositories({
      register: [fakeRegisterEntry({ id: '1', slug: 'a', legalName: 'Meridian Freight' })],
    });

    const { container } = render(await ResearchRegisterPage());

    expect(container.textContent).not.toMatch(/\d+(\.\d+)?\s?(btc|bitcoin)\b/i);
  });

  it('surfaces a self-description that diverges from the archetype', async () => {
    repositories = createFakeRepositories({
      register: [
        fakeRegisterEntry({
          id: '1',
          slug: 'a',
          legalName: 'Meridian Freight',
          primaryArchetype: 'treasury_allocation',
          selfDescribedArchetype: 'treasury_company',
        }),
      ],
    });

    render(await ResearchRegisterPage());

    expect(screen.getByText(/describes itself as/)).toBeInTheDocument();
  });

  it('marks a foreign exempt quotation as one', async () => {
    // An ASX quotation via foreign exempt CDI is not the same market-access
    // fact as a primary listing, and the list has to say so.
    repositories = createFakeRepositories({
      register: [
        fakeRegisterEntry({
          id: '1',
          slug: 'a',
          legalName: 'Nyala Payments',
          tier: 'bellwether',
          listings: [
            {
              venue: 'asx',
              ticker: 'NYLA',
              listingType: 'cdi_foreign_exempt',
              filingEntity: null,
              listedFrom: null,
              listedTo: null,
            },
          ],
        }),
      ],
    });

    render(await ResearchRegisterPage());

    expect(screen.getByText(/foreign exempt/)).toBeInTheDocument();
  });

  it('hides a tier with no records rather than rendering an empty heading', async () => {
    repositories = createFakeRepositories({
      register: [fakeRegisterEntry({ id: '1', slug: 'a', tier: 'regional' })],
    });

    render(await ResearchRegisterPage());

    expect(screen.queryByRole('heading', { name: 'Bellwethers' })).not.toBeInTheDocument();
  });

  it('says what to do next when the register is empty', async () => {
    render(await ResearchRegisterPage());

    expect(screen.getByText(/seeded by hand/)).toBeInTheDocument();
  });

  it('links each record to its own page by slug', async () => {
    repositories = createFakeRepositories({
      register: [
        fakeRegisterEntry({ id: '1', slug: 'demo-meridian-freight', legalName: 'Meridian' }),
      ],
    });

    render(await ResearchRegisterPage());

    const link = screen.getByRole('link', { name: /Meridian/ });
    expect(link).toHaveAttribute('href', '/research/demo-meridian-freight');
  });
});
