import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SlideOver } from './SlideOver';

describe('SlideOver', () => {
  it('renders nothing when closed', () => {
    render(<SlideOver open={false} onClose={vi.fn()} title="Edit contact">body</SlideOver>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes a labelled modal dialog with a named close button', () => {
    render(<SlideOver open onClose={vi.fn()} title="Edit contact">body</SlideOver>);

    const dialog = screen.getByRole('dialog', { name: 'Edit contact' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('closes on the Escape key', async () => {
    const onClose = vi.fn();
    render(<SlideOver open onClose={onClose} title="Edit contact">body</SlideOver>);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
