import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChipField } from './ChipField';

describe('ChipField', () => {
  it('renders the controlled value as chips', () => {
    render(<ChipField value={['alpha', 'beta']} onChange={() => {}} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('calls onChange with the appended tag on Enter', async () => {
    const onChange = vi.fn();
    render(<ChipField value={['alpha']} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'beta{Enter}');
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('applies the transform and drops duplicates', async () => {
    const onChange = vi.fn();
    render(<ChipField value={['bitcoin']} onChange={onChange} transform={(s) => s.trim().toLowerCase()} />);
    await userEvent.type(screen.getByRole('textbox'), 'BITCOIN{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not commit on blur by default', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<ChipField value={[]} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'x');
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  it('commits on blur when addOnBlur is set', async () => {
    const onChange = vi.fn();
    render(<ChipField value={[]} onChange={onChange} addOnBlur />);
    await userEvent.type(screen.getByRole('textbox'), 'y');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(['y']);
  });

  it('removes the last chip on Backspace when empty', async () => {
    const onChange = vi.fn();
    render(<ChipField value={['keep', 'drop']} onChange={onChange} />);
    screen.getByRole('textbox').focus();
    await userEvent.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['keep']);
  });
});
