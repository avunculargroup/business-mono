import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const addMock = vi.fn();
const removeMock = vi.fn();
vi.mock('@/app/actions/newsSources', () => ({
  addPaywalledDomain: (...args: unknown[]) => addMock(...args),
  removePaywalledDomain: (...args: unknown[]) => removeMock(...args),
}));

const errorToast = vi.fn();
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: errorToast }),
}));

const { PaywalledDomains } = await import('./PaywalledDomains');

beforeEach(() => {
  addMock.mockReset();
  removeMock.mockReset();
  errorToast.mockReset();
});

describe('PaywalledDomains', () => {
  it('lists the seeded sites', () => {
    render(<PaywalledDomains initialDomains={[{ id: '1', domain: 'bloomberg.com' }, { id: '2', domain: 'ft.com' }]} />);
    expect(screen.getByText('bloomberg.com')).toBeInTheDocument();
    expect(screen.getByText('ft.com')).toBeInTheDocument();
  });

  it('adds the normalised site the action returns and clears the field', async () => {
    addMock.mockResolvedValue({ success: true, domain: { id: '3', domain: 'afr.com' } });
    render(<PaywalledDomains initialDomains={[]} />);

    await userEvent.type(screen.getByLabelText('Site'), 'https://www.afr.com/markets');
    await userEvent.click(screen.getByRole('button', { name: 'Add site' }));

    expect(addMock).toHaveBeenCalledWith('https://www.afr.com/markets');
    expect(screen.getByText('afr.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Site')).toHaveValue('');
  });

  it('shows the action error and keeps the list unchanged', async () => {
    addMock.mockResolvedValue({ error: 'ft.com is already on the list.' });
    render(<PaywalledDomains initialDomains={[{ id: '2', domain: 'ft.com' }]} />);

    await userEvent.type(screen.getByLabelText('Site'), 'ft.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add site' }));

    expect(errorToast).toHaveBeenCalledWith('ft.com is already on the list.');
    expect(screen.getAllByText('ft.com')).toHaveLength(1);
  });

  it('removes a site', async () => {
    removeMock.mockResolvedValue({ success: true });
    render(<PaywalledDomains initialDomains={[{ id: '2', domain: 'ft.com' }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove ft.com' }));

    expect(removeMock).toHaveBeenCalledWith('2');
    expect(screen.queryByText('ft.com')).not.toBeInTheDocument();
  });
});
