import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CompanyFact, LedgerEntry } from '@platform/data';

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

  it('reads the reviewer\'s view: unclassified rows and draft rows, marked', async () => {
    // `publishableOnly` is for a client-facing surface. The internal register
    // shows internal rows, marked, and the drafts a reviewer is there to read.
    await ResearchCompanyPage({ params });

    const { corporateHoldings } = repositories;
    expect(corporateHoldings.getLedger).toHaveBeenCalledWith(expect.anything(), 'rc-1', {
      includeDrafts: true,
    });
    expect(corporateHoldings.getCompanyFacts).toHaveBeenCalledWith(expect.anything(), 'rc-1', {
      includeDrafts: true,
    });
    expect(corporateHoldings.getStructuralAbsences).toHaveBeenCalledWith(
      expect.anything(),
      'rc-1',
      { includeDrafts: true },
    );
  });

  it('groups draft rows by the run that wrote them, hand-written ones together', async () => {
    const row = (id: string, reviewState: string, ingestRunId: string | null) =>
      ({ id, reviewState, ingestRunId }) as unknown as LedgerEntry;
    repositories = createFakeRepositories({
      ledger: [
        row('e1', 'draft', 'run-aaaaaaaa1'),
        row('e2', 'draft', 'run-aaaaaaaa1'),
        row('e3', 'draft', null),
        row('e4', 'internal', 'run-bbbbbbbb2'),
      ],
      facts: [{ id: 'f1', reviewState: 'draft' } as unknown as CompanyFact],
    });

    render(await ResearchCompanyPage({ params }));

    expect(screen.getByText(/Ingest run run-aaaa · 2 rows/)).toBeInTheDocument();
    // The hand-written event and the draft fact: the ingest writes no facts.
    expect(screen.getByText(/Entered by hand · 2 rows/)).toBeInTheDocument();
    // A reviewed row is in no group.
    expect(screen.queryByText(/run-bbbb/)).not.toBeInTheDocument();
  });

  it('shows the summary the ingest drafted, for the record it belongs to', async () => {
    repositories.corporateHoldings.getSummaryDraft.mockResolvedValueOnce({
      companyId: 'rc-1',
      body: 'Holds bitcoin directly, with a third-party custodian.',
      draftedAt: '2026-10-05T03:00:00Z',
      ingestRunId: 'run-1',
    });

    render(await ResearchCompanyPage({ params }));

    const company = await repositories.corporateHoldings.getCompany.mock.results[0]!.value;
    expect(repositories.corporateHoldings.getSummaryDraft).toHaveBeenCalledWith(
      expect.anything(),
      company!.id,
    );
    expect(screen.getByRole('region', { name: 'Drafted subscriber summary' })).toHaveTextContent(
      'Holds bitcoin directly, with a third-party custodian.',
    );
  });

  it('404s on a slug that resolves to nothing', async () => {
    repositories = createFakeRepositories({ dossier: null });

    await expect(ResearchCompanyPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });
});
