import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { JurisdictionNote } from '@platform/data';

import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

import JurisdictionsPage from './page';

function note(overrides: Partial<JurisdictionNote> = {}): JurisdictionNote {
  return {
    id: 'jn-1',
    noteKey: 'aasb_138_revaluation',
    topic: 'accounting',
    title: 'The revaluation model',
    body: 'Gains accumulate in equity.\n\nLosses land in profit once the reserve is exhausted.',
    ruleReference: 'AASB 138, paragraphs 72-87',
    primarySourceUrl: null,
    appliesToStandard: 'aasb',
    appliesToVenue: null,
    appliesToListingType: null,
    verifiedAt: null,
    isPublished: false,
    ...overrides,
  };
}

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('JurisdictionsPage', () => {
  it('renders a note with its rule reference', async () => {
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([note()]);

    render(await JurisdictionsPage());

    expect(screen.getByRole('heading', { name: 'The revaluation model' })).toBeInTheDocument();
    expect(screen.getByText(/AASB 138, paragraphs 72-87/)).toBeInTheDocument();
  });

  it('renders each paragraph of the body separately', async () => {
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([note()]);

    render(await JurisdictionsPage());

    expect(screen.getByText(/Gains accumulate in equity/)).toBeInTheDocument();
    expect(screen.getByText(/Losses land in profit/)).toBeInTheDocument();
  });

  it('deduplicates a note that matches on more than one dimension', async () => {
    // A note keyed only on venue matches several of the queries this page
    // makes. Rendering it three times would read as sloppy and suggest three
    // different rules.
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([note()]);

    render(await JurisdictionsPage());

    expect(screen.getAllByRole('heading', { name: 'The revaluation model' })).toHaveLength(1);
  });

  it('marks an unsigned-off note as internal', async () => {
    // v1 is internal only. A note that has not been approved says so on its
    // face rather than relying on the page it happens to be on.
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([note()]);

    render(await JurisdictionsPage());

    expect(screen.getByText('Internal — not signed off')).toBeInTheDocument();
  });

  it('does not mark a signed-off note', async () => {
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([
      note({ isPublished: true }),
    ]);

    render(await JurisdictionsPage());

    expect(screen.queryByText('Internal — not signed off')).not.toBeInTheDocument();
  });

  it('says what to do next when no note exists', async () => {
    repositories.corporateHoldings.getJurisdictionNotes.mockResolvedValue([]);

    render(await JurisdictionsPage());

    expect(screen.getByText(/Start with the accounting models/)).toBeInTheDocument();
  });
});
