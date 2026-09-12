import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let supabase: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}));

vi.mock('./ClientAccounts', () => ({
  ClientAccounts: ({
    accounts,
  }: {
    accounts: Array<{
      displayName: string;
      seats: Array<{ email: string }>;
      invites: Array<{ email: string; state: string }>;
      operations: { blocked: string[]; activity: string };
    }>;
  }) => (
    <div
      data-testid="accounts"
      data-names={accounts.map((a) => a.displayName).join(',')}
      data-seats={accounts.map((a) => a.seats.map((s) => s.email).join('|')).join(';')}
      data-invites={accounts
        .map((a) => a.invites.map((i) => `${i.email}:${i.state}`).join('|'))
        .join(';')}
      data-blocked={accounts.map((a) => a.operations.blocked.join('|')).join(';')}
      data-activity={accounts.map((a) => a.operations.activity).join(';')}
    />
  ),
}));

import ClientsPage from './page';

const ACCOUNT = {
  id: 'acct-1',
  display_name: 'Sample Holdings Ltd',
  client_type: 'corporate',
  subscription_status: 'active',
  subscription_started_at: null,
  subscription_renews_at: null,
};

function invite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    account_id: 'acct-1',
    email: 'person@example.test',
    full_name: 'A Person',
    role: 'member',
    expires_at: '2099-01-01T00:00:00Z',
    accepted_at: null,
    revoked_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('client_accounts', { data: [ACCOUNT], error: null });
  supabase.__setResponse('client_users', { data: [], error: null });
  supabase.__setResponse('client_invites', { data: [], error: null });
  supabase.__setResponse('client_disclosures', { data: [], error: null });
  supabase.__setResponse('compliance_documents', { data: { version: '1.0' }, error: null });
});

function seat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    account_id: 'acct-1',
    full_name: 'A Person',
    email: 'a@example.test',
    role: 'primary',
    status: 'active',
    last_seen_at: null,
    ...overrides,
  };
}

describe('ClientsPage', () => {
  it('renders the header', async () => {
    render(await ClientsPage());

    expect(screen.getByRole('heading', { name: 'Subscribers' })).toBeInTheDocument();
  });

  it('groups seats under the account that owns them', async () => {
    supabase.__setResponse('client_users', {
      data: [
        { id: 'u1', account_id: 'acct-1', full_name: 'A', email: 'a@example.test', role: 'primary', status: 'active', last_seen_at: null },
        { id: 'u2', account_id: 'other', full_name: 'B', email: 'b@example.test', role: 'member', status: 'active', last_seen_at: null },
      ],
      error: null,
    });

    render(await ClientsPage());

    // The seat belonging to another account must not appear under this one.
    expect(screen.getByTestId('accounts')).toHaveAttribute('data-seats', 'a@example.test');
  });

  it('hides an accepted invitation, because its seat is already listed', async () => {
    // Showing both would double-count the same person under two headings.
    supabase.__setResponse('client_invites', {
      data: [invite({ accepted_at: '2026-01-01T00:00:00Z' })],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-invites', '');
  });

  it('marks an expired invitation as expired rather than open', async () => {
    supabase.__setResponse('client_invites', {
      data: [invite({ expires_at: '2000-01-01T00:00:00Z' })],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute(
      'data-invites',
      'person@example.test:expired',
    );
  });

  it('keeps a revoked invitation visible, so it is not silently forgotten', async () => {
    supabase.__setResponse('client_invites', {
      data: [invite({ revoked_at: '2026-01-01T00:00:00Z' })],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute(
      'data-invites',
      'person@example.test:revoked',
    );
  });

  it('orders accounts by name so the list does not shuffle', async () => {
    supabase.__setResponse('client_accounts', {
      data: [{ ...ACCOUNT, id: 'b', display_name: 'Zeta' }, { ...ACCOUNT, id: 'a', display_name: 'Alpha' }],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-names', 'Alpha,Zeta');
  });

  it('says so when the tables cannot be read', async () => {
    supabase.__setResponse('client_accounts', {
      data: null,
      error: { message: 'relation "client_accounts" does not exist' },
    });

    render(await ClientsPage());

    expect(screen.getByRole('status')).toHaveTextContent(/Could not read the subscriber tables/);
  });
});

describe('the operational readout', () => {
  it('names who is locked out by the current Service Statement', async () => {
    // The incident this page exists to surface. Publishing a version is one
    // click and puts every subscriber back at the gate.
    supabase.__setResponse('client_users', { data: [seat()], error: null });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-blocked', 'A Person');
  });

  it('clears someone who acknowledged the current version', async () => {
    supabase.__setResponse('client_users', { data: [seat()], error: null });
    supabase.__setResponse('client_disclosures', {
      data: [{ client_user_id: 'u1', document_version: '1.0' }],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-blocked', '');
  });

  it('still blocks someone who only acknowledged a superseded version', async () => {
    supabase.__setResponse('client_users', { data: [seat()], error: null });
    supabase.__setResponse('client_disclosures', {
      data: [{ client_user_id: 'u1', document_version: '0.9' }],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-blocked', 'A Person');
  });

  it('reports an account nobody has ever opened', async () => {
    // Distinct from dormant: onboarding stalled rather than interest faded.
    supabase.__setResponse('client_users', { data: [seat()], error: null });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-activity', 'never');
  });

  it('reports a recently used account as active', async () => {
    supabase.__setResponse('client_users', {
      data: [seat({ last_seen_at: new Date().toISOString() })],
      error: null,
    });

    render(await ClientsPage());

    expect(screen.getByTestId('accounts')).toHaveAttribute('data-activity', 'active');
  });
});
