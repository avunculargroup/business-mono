import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BasisChip } from './BasisChip';

describe('BasisChip', () => {
  it('marks an ETF-wrapped holding as excluded from totals', () => {
    render(<BasisChip basis="etf_wrapped" comparable={false} />);

    const chip = screen.getByText('ETF-wrapped');
    expect(chip).toHaveTextContent('· excluded');
    expect(chip).toHaveAttribute('title', expect.stringContaining('never enters a total'));
  });

  it('takes comparability from the caller, not from the basis name', () => {
    render(<BasisChip basis="direct_spot" comparable />);

    expect(screen.getByText('Direct spot')).not.toHaveTextContent('excluded');
  });
});
