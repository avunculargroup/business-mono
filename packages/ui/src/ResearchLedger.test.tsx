import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ResearchLedger, type LedgerRow } from './ResearchLedger';
import { ProvenanceProvider } from './ProvenanceRail';

const announcement = {
  documentTitle: 'Treasury Update',
  sourceClass: 'exchange_announcement' as const,
  sourceUrl: 'https://co.test/treasury.pdf',
  publishedAt: '2025-06-04',
  isAudited: false,
};

const acquisition: LedgerRow = {
  id: 'evt-1',
  eventDate: '2025-06-04',
  eventType: 'acquisition',
  headline: 'First acquisition',
  detail: 'Inclusive of fees and expenses.',
  quantity: 6.08914,
  assetClass: 'btc',
  considerationNative: 1000000,
  nativeCurrency: 'AUD',
  considerationAud: 1000000,
  fxRateUsed: null,
  feesIncluded: true,
  basis: 'direct_spot',
  basisComparable: true,
  classification: 'publishable',
  provenance: announcement,
};

function renderLedger(rows: LedgerRow[], shown = true) {
  return render(
    <ProvenanceProvider shown={shown}>
      <ResearchLedger rows={rows} />
    </ProvenanceProvider>,
  );
}

describe('ResearchLedger', () => {
  it('names the source of every numeric fact', () => {
    // The acceptance criterion: the provenance rail reveals a source on every
    // numeric fact. A figure a reader cannot trace is the bug this exists to
    // prevent.
    renderLedger([acquisition]);

    expect(screen.getByText('Treasury Update')).toBeInTheDocument();
    expect(screen.getByText('Exchange announcement')).toBeInTheDocument();
  });

  it('keeps the citation reachable with the rail collapsed', () => {
    // Condensed, never removed — the citation stays in the accessibility tree
    // whether or not a sighted reader has expanded it.
    renderLedger([acquisition], false);

    expect(screen.getByText('Treasury Update')).toBeInTheDocument();
  });

  it('renders a quantity at full precision', () => {
    // A rounded quantity is the exact failure the numeric validator exists to
    // catch upstream; the page must not reintroduce it in formatting.
    renderLedger([acquisition]);

    expect(screen.getByText(/6\.08914 BTC/)).toBeInTheDocument();
  });

  it('says a consideration is fee-inclusive where the document did', () => {
    // Without it a reader computing an average price gets a different number
    // from the issuer's and cannot tell why.
    renderLedger([acquisition]);

    expect(screen.getByText(/incl\. fees/)).toBeInTheDocument();
  });

  it('names the rate behind a converted figure', () => {
    renderLedger([
      {
        ...acquisition,
        nativeCurrency: 'NZD',
        considerationNative: 500000,
        considerationAud: 460000,
        fxRateUsed: 0.92,
      },
    ]);

    expect(screen.getByText(/at 0\.92/)).toBeInTheDocument();
  });

  it('marks an event whose natural reading is a view on the security', () => {
    renderLedger([
      {
        ...acquisition,
        id: 'evt-2',
        eventType: 'covenant_change',
        headline: 'Cash covenant amended to admit bitcoin',
        classification: 'internal',
      },
    ]);

    expect(screen.getByText(/does not reach a client-facing surface/)).toBeInTheDocument();
  });

  it('says so plainly when an event discloses no figure', () => {
    renderLedger([
      {
        ...acquisition,
        id: 'evt-3',
        eventType: 'policy_adoption',
        headline: 'Treasury management policy adopted',
        quantity: null,
        considerationNative: null,
        considerationAud: null,
        basis: null,
        basisComparable: null,
      },
    ]);

    expect(screen.getByText('No figure disclosed')).toBeInTheDocument();
  });

  it('renders silence as a record rather than a broken page', () => {
    // Most weeks nothing happens, and a thin ledger has to read as legitimate.
    renderLedger([]);

    expect(screen.getByText(/record of silence, not a gap/)).toBeInTheDocument();
  });

  it('carries the basis on a row that has one', () => {
    renderLedger([acquisition]);

    const row = screen.getByRole('listitem', { name: '' });
    expect(within(row.parentElement!).getByText('Direct spot')).toBeInTheDocument();
  });
});
