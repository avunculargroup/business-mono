import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalIdentitySection } from './LegalIdentitySection';

describe('LegalIdentitySection', () => {
  it('shows the profile values and links to the one form that writes them', () => {
    render(
      <LegalIdentitySection
        profile={{
          legal_name: 'Avuncular Group Pty Ltd',
          trading_name: 'Bitcoin Treasury Solutions',
          abn: '82683088173',
          acn: '683088173',
          public_website: 'https://www.bitcointreasurysolutions.com.au',
        }}
      />,
    );

    expect(screen.getByText('Avuncular Group Pty Ltd')).toBeInTheDocument();
    expect(screen.getByText('82683088173')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit on Compliance' })).toHaveAttribute(
      'href',
      '/compliance',
    );
  });

  it('marks the fields nothing has ever filled in', () => {
    render(<LegalIdentitySection profile={{ legal_name: 'Avuncular Group Pty Ltd' }} />);

    // Eight of the thirteen existed nowhere before the profile did, so a fresh
    // install shows most of this panel unset. "Not set" rather than a blank
    // line, because a blank line reads as a rendering fault.
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
  });

  it('explains what an empty singleton blocks rather than rendering bare labels', () => {
    render(<LegalIdentitySection profile={null} />);

    expect(screen.getByText(/Service Statement/)).toBeInTheDocument();
    expect(screen.queryByText('ABN')).not.toBeInTheDocument();
  });
});
