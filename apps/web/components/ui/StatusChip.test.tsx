import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders the label text', () => {
    render(<StatusChip label="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders as an inline span element', () => {
    render(<StatusChip label="Pending" />);
    expect(screen.getByText('Pending').tagName).toBe('SPAN');
  });

  it('passes a custom className through verbatim', () => {
    render(<StatusChip label="Done" className="my-chip" />);
    expect(screen.getByText('Done')).toHaveClass('my-chip');
  });
});
