import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No contacts yet" description="Add your first contact." />);

    expect(screen.getByRole('heading', { name: 'No contacts yet' })).toBeInTheDocument();
    expect(screen.getByText('Add your first contact.')).toBeInTheDocument();
  });

  it('hides the action button when no action is provided', () => {
    render(<EmptyState title="Empty" description="Nothing here." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the action button when a label is given without a handler', () => {
    render(<EmptyState title="Empty" description="Nothing here." actionLabel="Add" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the action and fires onAction when both label and handler are given', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        description="Nothing here."
        actionLabel="Add contact"
        onAction={onAction}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
