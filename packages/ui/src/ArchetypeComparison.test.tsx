import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArchetypeComparison, type ComparableCompany } from './ArchetypeComparison';

const meridian: ComparableCompany = {
  slug: 'demo-meridian-freight',
  legalName: 'Meridian Freight Group Limited',
  primaryArchetype: 'treasury_allocation',
  selfDescribedArchetype: 'treasury_company',
  jurisdiction: 'NZ',
  reportingStandard: 'nz_ifrs',
};

const tarra: ComparableCompany = {
  slug: 'demo-tarra-holdings',
  legalName: 'Tarra Holdings Limited',
  primaryArchetype: 'treasury_allocation',
  selfDescribedArchetype: null,
  jurisdiction: 'AU',
  reportingStandard: 'aasb',
};

describe('ArchetypeComparison', () => {
  it('renders the explanatory panel rather than a table across archetypes', () => {
    // The third session-3 acceptance criterion.
    render(
      <ArchetypeComparison
        companies={[]}
        mismatch={['treasury_allocation', 'native_exposure']}
      />,
    );

    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText('These records are not comparable')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says what each archetype is, so the refusal is an explanation', () => {
    render(
      <ArchetypeComparison
        companies={[]}
        mismatch={['treasury_allocation', 'native_exposure']}
      />,
    );

    expect(screen.getByText(/operating business allocating surplus capital/)).toBeInTheDocument();
    expect(screen.getByText(/fund manager or exchange/)).toBeInTheDocument();
  });

  it('renders the table within one archetype', () => {
    // Without this the refusal case passes for a component that refuses
    // everything, which is not the rule.
    render(<ArchetypeComparison companies={[meridian, tarra]} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Meridian Freight Group Limited')).toBeInTheDocument();
    expect(screen.getByText('Tarra Holdings Limited')).toBeInTheDocument();
  });

  it('shows a self-description that diverges from the archetype', () => {
    // The divergence is the case study, so the table has to surface it rather
    // than reconcile it away.
    render(<ArchetypeComparison companies={[meridian, tarra]} />);

    expect(screen.getByText('Treasury company')).toBeInTheDocument();
    // Tarra describes itself as nothing in particular, which renders as an
    // em dash rather than as agreement it never expressed.
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
