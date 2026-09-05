import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AbsencePanel,
  FactPanel,
  FreshnessStamp,
  PositionPanel,
  WithheldPanel,
  type FactView,
  type PositionRowView,
} from './ResearchPanels';
import { ProvenanceProvider } from './ProvenanceRail';

const quarterly = {
  documentTitle: 'Quarterly cash flow report',
  sourceClass: 'exchange_announcement' as const,
  sourceUrl: '/docs/4c.pdf',
  publishedAt: '2026-04-22',
  isAudited: false,
};

const direct: PositionRowView = {
  id: 'pos-1',
  asOfDate: '2026-06-30',
  asset: 'btc',
  instrumentType: 'spot',
  quantity: 308.8,
  basis: 'direct_spot',
  basisComparable: true,
  lookThroughBtcEquivalent: null,
  isRelatedPartyVehicle: false,
  includesCustomerAssets: false,
  provenance: quarterly,
};

const lookThrough: PositionRowView = {
  ...direct,
  id: 'pos-2',
  instrumentType: 'fund_units',
  quantity: 889367,
  basis: 'look_through',
  basisComparable: false,
  lookThroughBtcEquivalent: 194.85,
  isRelatedPartyVehicle: true,
};

function withRail(node: React.ReactNode) {
  return render(<ProvenanceProvider shown>{node}</ProvenanceProvider>);
}

describe('PositionPanel', () => {
  it('totals only the comparable rows', () => {
    withRail(
      <PositionPanel
        asset="btc"
        comparableTotal={308.8}
        rows={[direct, lookThrough]}
        excluded={[lookThrough]}
      />,
    );

    // Two matches by design: the total and the row it came from. The point is
    // that the look-through row's 889,367 is in neither.
    expect(screen.getAllByText(/308\.8 BTC/)).toHaveLength(2);
    expect(screen.getByText(/1 row excluded/)).toBeInTheDocument();
  });

  it('renders the excluded row rather than hiding it', () => {
    // A reader who cannot see that the issuer stated a larger figure is worse
    // off than one who can.
    withRail(
      <PositionPanel
        asset="btc"
        comparableTotal={308.8}
        rows={[direct, lookThrough]}
        excluded={[lookThrough]}
      />,
    );

    // Counted in units, not in the asset. 889,367 fund units is not 889,367
    // bitcoin — the issuer states the equivalent separately, and it is three
    // orders of magnitude smaller.
    expect(screen.getByText(/889,367 units/)).toBeInTheDocument();
    expect(screen.queryByText(/889,367 BTC/)).not.toBeInTheDocument();
    expect(screen.getByText(/equivalent to 194\.85 BTC/)).toBeInTheDocument();
    // The chip splits its label and its marker across two elements, so match
    // the accessible container rather than a single text node.
    expect(screen.getByTitle(/never enters a total/)).toHaveTextContent('Look-through · excluded');
  });

  it('counts a spot row in the asset', () => {
    withRail(<PositionPanel asset="btc" comparableTotal={308.8} rows={[direct]} excluded={[]} />);

    expect(screen.getAllByText(/308\.8 BTC/).length).toBeGreaterThan(0);
  });

  it('flags a holding in a vehicle the issuer manages', () => {
    withRail(
      <PositionPanel asset="btc" comparableTotal={0} rows={[lookThrough]} excluded={[lookThrough]} />,
    );

    expect(screen.getByText(/vehicle the issuer manages/)).toBeInTheDocument();
  });
});

describe('FactPanel', () => {
  const custody: FactView = {
    id: 'fact-1',
    fieldKey: 'custody',
    label: 'Custody',
    value: 'Held with an institutional custodian, in segregated accounts. No insurance.',
    asOf: '2025-11-03',
    provenance: {
      documentTitle: 'Offer document',
      sourceClass: 'regulated_disclosure',
      sourceUrl: '/docs/pds.pdf',
      publishedAt: '2025-11-03',
      isAudited: true,
    },
    conflicting: {
      value: 'The About page states self-custody with no counterparty risk.',
      provenance: {
        documentTitle: 'About us',
        sourceClass: 'company_web',
        sourceUrl: '/about',
      },
    },
  };

  it('shows the winning claim with its source class', () => {
    withRail(<FactPanel fact={custody} />);

    expect(screen.getByText('Regulated disclosure')).toBeInTheDocument();
  });

  it('renders the losing claim beside it rather than deleting it', () => {
    // The conflict is the finding. A register that resolved it out of sight
    // would teach the opposite of the lesson.
    withRail(<FactPanel fact={custody} />);

    expect(screen.getByText(/self-custody with no counterparty risk/)).toBeInTheDocument();
    expect(screen.getByText('Company website')).toBeInTheDocument();
  });

  it('says why the stronger document won', () => {
    withRail(<FactPanel fact={custody} />);

    expect(screen.getByText(/Marketing copy cannot populate a controls field/)).toBeInTheDocument();
  });

  it('renders no conflict block on an undisputed fact', () => {
    withRail(<FactPanel fact={{ ...custody, conflicting: null }} />);

    expect(screen.queryByText(/A weaker source says otherwise/)).not.toBeInTheDocument();
  });
});

describe('AbsencePanel', () => {
  it('states an absence as a cited fact', () => {
    // An empty covenant panel and a company with no debt look identical on a
    // screen, and only one of them is an answer.
    withRail(
      <AbsencePanel
        absences={[
          {
            subject: 'covenants',
            statement: 'No financing facilities at quarter end. There is no debt.',
            provenance: quarterly,
          },
        ]}
      />,
    );

    expect(screen.getByText(/There is no debt/)).toBeInTheDocument();
    expect(screen.getByText('Quarterly cash flow report')).toBeInTheDocument();
  });
});

describe('WithheldPanel', () => {
  it('names what is withheld and why', () => {
    // Compliance as architecture, not as a disclaimer.
    render(
      <WithheldPanel
        fields={[
          {
            fieldKey: 'unrealised_position',
            classification: 'restricted',
            reason: 'Position against cost basis is a valuation output.',
          },
        ]}
      />,
    );

    expect(screen.getByText('Unrealised position against cost basis')).toBeInTheDocument();
    expect(screen.getByText('restricted')).toBeInTheDocument();
    expect(screen.getByText(/valuation output/)).toBeInTheDocument();
  });
});

describe('FreshnessStamp', () => {
  it('names the cadence it is judging against', () => {
    render(
      <FreshnessStamp
        cadence="monthly"
        latestDocumentAt="2026-03-20"
        daysSinceDocument={92}
        staleAfterDays={45}
        isStale
      />,
    );

    expect(screen.getByText(/Overdue against a monthly cadence/)).toBeInTheDocument();
  });

  it('reads the same silence as normal for an episodic discloser', () => {
    render(
      <FreshnessStamp
        cadence="episodic"
        latestDocumentAt="2025-11-20"
        daysSinceDocument={210}
        staleAfterDays={240}
        isStale={false}
      />,
    );

    expect(screen.getByText(/Within an? episodic cadence/)).toBeInTheDocument();
  });

  it('distinguishes never fetched from gone quiet', () => {
    render(
      <FreshnessStamp
        cadence="quarterly"
        latestDocumentAt={null}
        daysSinceDocument={null}
        staleAfterDays={135}
        isStale={false}
      />,
    );

    expect(screen.getByText(/nobody has fetched for/)).toBeInTheDocument();
  });
});
