import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusChip } from './StatusChip';
import { hasLocalClass } from '@/test/cssClass';

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

  it('always applies the base chip class', () => {
    render(<StatusChip label="X" />);
    expect(hasLocalClass(screen.getByText('X'), 'chip')).toBe(true);
  });

  it('defaults to the neutral color class', () => {
    render(<StatusChip label="X" />);
    expect(hasLocalClass(screen.getByText('X'), 'neutral')).toBe(true);
  });

  it.each(['neutral', 'accent', 'success', 'warning', 'destructive'] as const)(
    'maps color="%s" to the matching variant class',
    (color) => {
      render(<StatusChip label="X" color={color} />);
      expect(hasLocalClass(screen.getByText('X'), color)).toBe(true);
    },
  );
});
