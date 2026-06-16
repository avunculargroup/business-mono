import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PipelineChip } from './PipelineChip';
import { hasLocalClass } from '@/test/cssClass';

describe('PipelineChip', () => {
  it.each([
    ['lead', 'Lead', 'neutral'],
    ['warm', 'Warm', 'warning'],
    ['active', 'Active', 'accent'],
    ['client', 'Client', 'success'],
    ['dormant', 'Dormant', 'destructive'],
  ])('renders %s as "%s" with the %s color', (stage, label, color) => {
    render(<PipelineChip stage={stage} />);
    const chip = screen.getByText(label);
    expect(chip).toBeInTheDocument();
    expect(hasLocalClass(chip, color)).toBe(true);
  });

  it('falls back to the raw value and neutral color for an unknown stage', () => {
    render(<PipelineChip stage="archived" />);
    const chip = screen.getByText('archived');
    expect(chip).toBeInTheDocument();
    expect(hasLocalClass(chip, 'neutral')).toBe(true);
  });
});
