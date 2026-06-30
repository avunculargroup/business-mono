import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RowActionsMenu } from './RowActionsMenu';

const actions = [
  { label: 'Edit', onClick: vi.fn() },
  { label: 'Delete', onClick: vi.fn(), destructive: true },
];

describe('RowActionsMenu', () => {
  it('exposes the trigger as a menu button that is collapsed by default', () => {
    render(<RowActionsMenu actions={actions} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a menu of menuitems and focuses the first item', async () => {
    render(<RowActionsMenu actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }));

    expect(screen.getByRole('button', { name: 'Row actions' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Edit', 'Delete']);
    expect(items[0]).toHaveFocus();
  });

  it('cycles focus between items with the arrow keys', async () => {
    render(<RowActionsMenu actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    const items = screen.getAllByRole('menuitem');

    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // wraps to first
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}'); // wraps to last
    expect(items[1]).toHaveFocus();
  });

  it('fires the action handler and closes the menu on select', async () => {
    const onClick = vi.fn();
    render(<RowActionsMenu actions={[{ label: 'Edit', onClick }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<RowActionsMenu actions={actions} />);
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
