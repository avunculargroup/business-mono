import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const actions = vi.hoisted(() => ({
  createClientAccount: vi.fn(async () => ({ success: true })),
  issueClientInvite: vi.fn(async () => ({ success: true, url: 'https://minute.test/invite/tok' })),
  revokeClientInvite: vi.fn(async () => ({ success: true })),
  setClientSeatStatus: vi.fn(async () => ({ success: true })),
  setSubscriptionStatus: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/actions/clientAccounts', () => actions);

import { ClientAccounts, type AccountRow } from './ClientAccounts';

function account(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acct-1',
    displayName: 'Sample Holdings Ltd',
    clientType: 'corporate',
    subscriptionStatus: 'active',
    startedAt: null,
    renewsAt: null,
    seats: [
      {
        id: 'u1',
        fullName: 'A Person',
        email: 'a@example.test',
        role: 'primary',
        status: 'active',
        lastSeenAt: null,
      },
    ],
    invites: [],
    operations: { blocked: [], daysSinceLastSeen: null, activity: 'never' },
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockClear();
});

/**
 * The invitation token is shown once and cannot be recovered — only its hash is
 * stored. Everything below is about not losing it.
 */
describe('the invitation link', () => {
  async function issue() {
    const user = userEvent.setup();
    render(<ClientAccounts accounts={[account()]} />);
    await user.click(screen.getByRole('button', { name: /Invite someone/ }));
    await user.type(screen.getByLabelText('Full name'), 'B Person');
    await user.type(screen.getByLabelText('Email'), 'b@example.test');
    await user.click(screen.getByRole('button', { name: 'Issue invitation' }));
    return user;
  }

  it('shows the link after issuing', async () => {
    await issue();

    expect(screen.getByText('https://minute.test/invite/tok')).toBeInTheDocument();
  });

  it('says Copied only when the clipboard actually took it', async () => {
    const user = await issue();

    // Defined after `userEvent.setup()`, which installs a clipboard stub of its
    // own and would otherwise clobber this one. `navigator.clipboard` is a
    // getter in jsdom, so it is defined rather than assigned.
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await user.click(screen.getByRole('button', { name: /Copy/ }));

    expect(writeText).toHaveBeenCalledWith('https://minute.test/invite/tok');
    expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('does not claim a copy that failed, and says the link is about to be lost', async () => {
    // The worst bug this page can have. A button that says "Copied" when the
    // clipboard refused loses the invitation for good — there is nothing to
    // recover it from.
    const user = await issue();

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });

    await user.click(screen.getByRole('button', { name: /Copy/ }));

    expect(screen.queryByRole('button', { name: /Copied/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/copy it by hand/);
  });
});

describe('status changes that must not fail silently', () => {
  it('surfaces a refusal when disabling a seat', async () => {
    // Disabling a seat is access revocation. A discarded failure means someone
    // believes they revoked access and did not.
    actions.setClientSeatStatus.mockResolvedValueOnce({ error: 'permission denied' } as never);

    const user = userEvent.setup();
    render(<ClientAccounts accounts={[account()]} />);
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
  });

  it('surfaces a refusal when changing the subscription status', async () => {
    actions.setSubscriptionStatus.mockResolvedValueOnce({ error: 'that account is gone' } as never);

    const user = userEvent.setup();
    render(<ClientAccounts accounts={[account()]} />);
    await user.selectOptions(screen.getByLabelText(/Subscription status/), 'paused');

    expect(screen.getByRole('alert')).toHaveTextContent('that account is gone');
  });

  it('shows nothing when the change succeeds', async () => {
    const user = userEvent.setup();
    render(<ClientAccounts accounts={[account()]} />);
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the operational readout', () => {
  it('names a locked-out subscriber', async () => {
    render(
      <ClientAccounts
        accounts={[
          account({
            operations: { blocked: ['A Person'], daysSinceLastSeen: 2, activity: 'active' },
          }),
        ]}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /A Person has not accepted the current Service Statement/,
    );
  });

  it('says nothing when everyone is through the gate', async () => {
    render(<ClientAccounts accounts={[account()]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
