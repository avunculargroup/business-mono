import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  createFakeRepositories,
  fakeCompanyDossier,
  type FakeRepositories,
} from '@/test/mocks/repositories';

let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));

// Stubbed so this stays a unit on the page's data wiring rather than on the
// record's interactive internals. The record's own behaviour is covered by the
// component tests in `packages/ui`.
vi.mock('@/components/research/CompanyRecord', () => ({
  CompanyRecord: ({
    company,
    ledger,
    withheld,
    notes,
  }: {
    company: { legalName: string };
    ledger: unknown[];
    withheld: unknown[];
    notes: unknown[];
  }) => (
    <div
      data-testid="company-record"
      data-ledger={ledger.length}
      data-withheld={withheld.length}
      data-notes={notes.length}
    >
      {company.legalName}
    </div>
  ),
}));

import ResearchCompanyPage from './page';

const params = Promise.resolve({ slug: 'demo-meridian-freight' });

beforeEach(() => {
  vi.clearAllMocks();
  repositories = createFakeRepositories();
});

describe('ResearchCompanyPage', () => {
  it('reads the record and hands it to the page', async () => {
    repositories = createFakeRepositories({
      dossier: fakeCompanyDossier({ legalName: 'Meridian Freight Group Limited' }),
    });

    render(await ResearchCompanyPage({ params }));

    expect(screen.getByTestId('company-record')).toHaveTextContent(
      'Meridian Freight Group Limited',
    );
  });

  it('resolves the record by slug, as every link into it does', async () => {
    await ResearchCompanyPage({ params });

    expect(repositories.corporateHoldings.getCompany).toHaveBeenCalledWith(
      expect.anything(),
      'demo-meridian-freight',
    );
  });

  it('joins the jurisdiction notes on the record own dimensions', async () => {
    // The panel is assembled by the adapter from a company's standard, venue
    // and listing type. A page that picked notes itself would be a page that
    // knows which notes exist.
    repositories = createFakeRepositories({
      dossier: fakeCompanyDossier({
        reportingStandard: 'nz_ifrs',
        listings: [
          {
            venue: 'nzx',
            ticker: 'MFGX',
            listingType: 'primary',
            filingEntity: null,
            listedFrom: null,
            listedTo: null,
          },
        ],
      }),
    });

    await ResearchCompanyPage({ params });

    expect(repositories.corporateHoldings.getJurisdictionNotes).toHaveBeenCalledWith(
      expect.anything(),
      { standard: 'nz_ifrs', venue: 'nzx', listingType: 'primary' },
    );
  });

  it('asks for the withheld list rather than assuming there is nothing to withhold', async () => {
    // Compliance as architecture: the page has to render what was withheld, so
    // it has to read it.
    await ResearchCompanyPage({ params });

    expect(repositories.corporateHoldings.getWithheldFields).toHaveBeenCalled();
  });

  it('reads the ledger unfiltered, because this surface is internal', async () => {
    // `publishableOnly` is for a client-facing surface. The internal register
    // shows internal rows, marked.
    await ResearchCompanyPage({ params });

    expect(repositories.corporateHoldings.getLedger).toHaveBeenCalledWith(
      expect.anything(),
      'rc-1',
    );
  });

  it('404s on a slug that resolves to nothing', async () => {
    repositories = createFakeRepositories({ dossier: null });

    await expect(ResearchCompanyPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });
});
