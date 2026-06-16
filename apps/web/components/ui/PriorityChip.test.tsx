import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PriorityChip } from './PriorityChip';
import { hasLocalClass } from '@/test/cssClass';

describe('PriorityChip', () => {
  it.each([
    ['low', 'Low', 'neutral'],
    ['medium', 'Medium', 'neutral'],
    ['high', 'High', 'warning'],
    ['urgent', 'Urgent', 'destructive'],
  ])('renders %s as "%s" with the %s color', (priority, label, color) => {
    render(<PriorityChip priority={priority} />);
    const chip = screen.getByText(label);
    expect(chip).toBeInTheDocument();
    expect(hasLocalClass(chip, color)).toBe(true);
  });

  it('falls back to the raw value and neutral color for an unknown priority', () => {
    render(<PriorityChip priority="someday" />);
    const chip = screen.getByText('someday');
    expect(chip).toBeInTheDocument();
    expect(hasLocalClass(chip, 'neutral')).toBe(true);
  });
});
