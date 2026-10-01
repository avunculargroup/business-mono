import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cited, ProvenanceProvider, SourceBadge, type ProvenanceSourceClass } from './ProvenanceRail';

function citedFrom(sourceClass: ProvenanceSourceClass) {
  return render(
    <ProvenanceProvider shown>
      <Cited
        fact={<span>303.1 BTC</span>}
        source={{ documentTitle: 'Form 10-Q', sourceClass, sourceUrl: null, publishedAt: '2026-06-30' }}
      />
    </ProvenanceProvider>,
  );
}

describe('ProvenanceRail', () => {
  // The ledger accepts a set, not everything above a rank: filed narrative
  // sits between two accepted classes in display order and is still refused.
  it.each<ProvenanceSourceClass>(['audited_accounts', 'filed_financials'])(
    'does not flag %s, which the ledger accepts',
    (sourceClass) => {
      citedFrom(sourceClass);
      expect(screen.queryByText('Below the class the ledger accepts')).not.toBeInTheDocument();
    },
  );

  it.each<ProvenanceSourceClass>(['filed_narrative', 'furnished_release'])(
    'flags %s, which the ledger refuses',
    (sourceClass) => {
      citedFrom(sourceClass);
      expect(screen.getByText('Below the class the ledger accepts')).toBeInTheDocument();
    },
  );

  it('counts every class in the badge title', () => {
    render(<SourceBadge sourceClass="secondary" />);
    expect(screen.getByText('Secondary')).toHaveAttribute('title', 'Source class 8 of 8');
  });
});
