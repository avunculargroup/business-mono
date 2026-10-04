import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReviewQueueEntry } from '@platform/data';

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

const registerView = { searchParams: Promise.resolve({}) };

const queued = (overrides: Partial<ReviewQueueEntry>): ReviewQueueEntry => ({
  companyId: overrides.slug ?? 'x',
  slug: 'x',
  legalName: 'Queued Co',
  tier: 'regional',
  companyReviewState: 'internal',
  draftEvents: 0,
  draftFindings: 0,
  draftFacts: 0,
  ...overrides,
});

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

    render(await ResearchRegisterPage(registerView));

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

    const { container } = render(await ResearchRegisterPage(registerView));

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

    render(await ResearchRegisterPage(registerView));

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

    render(await ResearchRegisterPage(registerView));

    expect(screen.getByText(/foreign exempt/)).toBeInTheDocument();
  });

  it('hides a tier with no records rather than rendering an empty heading', async () => {
    repositories = createFakeRepositories({
      register: [fakeRegisterEntry({ id: '1', slug: 'a', tier: 'regional' })],
    });

    render(await ResearchRegisterPage(registerView));

    expect(screen.queryByRole('heading', { name: 'Bellwethers' })).not.toBeInTheDocument();
  });

  it('says what to do next when the register is empty', async () => {
    render(await ResearchRegisterPage(registerView));

    expect(screen.getByText(/seeded by hand/)).toBeInTheDocument();
  });

  it('counts every record with something waiting on the review tab', async () => {
    repositories = createFakeRepositories({
      register: [fakeRegisterEntry({ id: '1', slug: 'a', legalName: 'Meridian Freight' })],
      reviewQueue: [queued({ slug: 'b', legalName: 'Wexford' }), queued({ slug: 'a' })],
    });

    render(await ResearchRegisterPage(registerView));

    expect(screen.getByText('Meridian Freight')).toBeInTheDocument();
    expect(screen.queryByText('Wexford')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /To review/ })).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-current', 'page');
  });

  it('lists the queue in the review view, saying what each record waits on', async () => {
    repositories = createFakeRepositories({
      register: [fakeRegisterEntry({ id: '1', slug: 'a', legalName: 'Meridian Freight' })],
      reviewQueue: [
        queued({ slug: 'b', legalName: 'Wexford', companyReviewState: 'draft' }),
        queued({ slug: 'a', legalName: 'Meridian Freight', draftEvents: 1, draftFacts: 2 }),
      ],
    });

    render(await ResearchRegisterPage({ searchParams: Promise.resolve({ view: 'review' }) }));

    // A new record and one new row on a settled record are both work.
    expect(screen.getByText('New record')).toBeInTheDocument();
    expect(screen.getByText('1 draft ledger event · 2 draft facts')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wexford/ })).toHaveAttribute('href', '/research/b');
    expect(screen.getByRole('link', { name: /To review/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('says the queue is empty rather than that the register is', async () => {
    render(await ResearchRegisterPage({ searchParams: Promise.resolve({ view: 'review' }) }));

    expect(screen.getByText(/Nothing is waiting for review/)).toBeInTheDocument();
    expect(screen.queryByText(/seeded by hand/)).not.toBeInTheDocument();
  });

  it('links each record to its own page by slug', async () => {
    repositories = createFakeRepositories({
      register: [
        fakeRegisterEntry({ id: '1', slug: 'demo-meridian-freight', legalName: 'Meridian' }),
      ],
    });

    render(await ResearchRegisterPage(registerView));

    const link = screen.getByRole('link', { name: /Meridian/ });
    expect(link).toHaveAttribute('href', '/research/demo-meridian-freight');
  });
});
