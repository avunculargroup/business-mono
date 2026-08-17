import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TagInput } from './TagInput';

function hidden(name: string): HTMLInputElement {
  return document.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement;
}

describe('TagInput', () => {
  it('renders seed tags and serialises them to the hidden field', () => {
    render(<TagInput name="tags" label="Tags" defaultValue={['alpha', 'beta']} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(hidden('tags').value).toBe(JSON.stringify(['alpha', 'beta']));
  });

  it('adds a tag on Enter and updates the hidden field', async () => {
    render(<TagInput name="tags" label="Tags" />);
    const input = screen.getByLabelText('Tags');
    await userEvent.type(input, 'gamma{Enter}');
    expect(screen.getByText('gamma')).toBeInTheDocument();
    expect(hidden('tags').value).toBe(JSON.stringify(['gamma']));
  });

  it('applies the transform and rejects duplicates', async () => {
    render(<TagInput name="tags" label="Tags" transform={(s) => s.trim().toLowerCase()} />);
    const input = screen.getByLabelText('Tags');
    await userEvent.type(input, 'Bitcoin{Enter}BITCOIN{Enter}');
    expect(hidden('tags').value).toBe(JSON.stringify(['bitcoin']));
  });

  it('removes the last tag on Backspace when the input is empty', async () => {
    render(<TagInput name="tags" label="Tags" defaultValue={['keep', 'drop']} />);
    const input = screen.getByLabelText('Tags');
    input.focus();
    await userEvent.keyboard('{Backspace}');
    expect(screen.queryByText('drop')).not.toBeInTheDocument();
    expect(hidden('tags').value).toBe(JSON.stringify(['keep']));
  });

  it('removes a tag via its remove button', async () => {
    render(<TagInput name="tags" label="Tags" defaultValue={['alpha', 'beta']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove "alpha"' }));
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(hidden('tags').value).toBe(JSON.stringify(['beta']));
  });
});
