import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let supabase: FakeSupabaseClient;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () =>
    authed
      ? { ok: true, supabase, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  createClientAccount,
  issueClientInvite,
  revokeClientInvite,
  setClientSeatStatus,
  setSubscriptionStatus,
} from './clientAccounts';

function inserted(table: string): Record<string, unknown> {
  return supabase.__buildersFor(table)[0]!.insert.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('client_accounts', { data: { id: 'acct-1' }, error: null });
  supabase.__setResponse('client_invites', { data: null, error: null });
  supabase.__setResponse('client_users', { data: null, error: null });
  authed = true;
  revalidatePath.mockClear();
  process.env['NEXT_PUBLIC_MINUTE_URL'] = 'https://minute.example';
});

describe('createClientAccount', () => {
  it('creates the account and returns its id', async () => {
    const result = await createClientAccount({ displayName: 'Sample Ltd', clientType: 'corporate' });

    expect(result).toEqual({ success: true, accountId: 'acct-1' });
    expect(inserted('client_accounts')).toMatchObject({
      display_name: 'Sample Ltd',
      client_type: 'corporate',
      created_by: 'director-1',
    });
  });

  it('starts as invited, not active', async () => {
    // An account that reads as active before anyone can log in would make the
    // subscription list lie about how many subscribers there are.
    await createClientAccount({ displayName: 'Sample Ltd', clientType: 'smsf' });

    expect(inserted('client_accounts').subscription_status).toBe('invited');
  });

  it('refuses an unnamed account', async () => {
    expect(await createClientAccount({ displayName: '  ', clientType: 'smsf' })).toEqual({
      error: 'Give the account a name.',
    });
  });
});

describe('issueClientInvite', () => {
  const input = {
    accountId: 'acct-1',
    email: 'Person@Example.com',
    fullName: 'A Person',
    role: 'primary' as const,
  };

  it('stores only the hash, never the token', async () => {
    // The single most important property in this file. If the plaintext ever
    // reached a column, an invitation would be forgeable by anyone who could
    // read the table.
    const result = await issueClientInvite(input);

    const row = inserted('client_invites');
    const token = (result.url as string).split('/invite/')[1]!;

    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('returns a link into the client app, not this one', async () => {
    const result = await issueClientInvite(input);

    expect(result.url).toMatch(/^https:\/\/minute\.example\/invite\/[A-Za-z0-9_-]+$/);
  });

  it('lowercases the email, because redemption matches on it', async () => {
    await issueClientInvite(input);

    expect(inserted('client_invites').email).toBe('person@example.com');
  });

  it('sets an expiry rather than leaving the invitation open forever', async () => {
    await issueClientInvite(input);

    const expiry = Date.parse(inserted('client_invites').expires_at as string);
    expect(expiry).toBeGreaterThan(Date.now());
  });

  it('honours a shorter window', async () => {
    await issueClientInvite({ ...input, days: 1 });

    const expiry = Date.parse(inserted('client_invites').expires_at as string);
    expect(expiry).toBeLessThan(Date.now() + 2 * 86_400_000);
  });

  it('mints a different token every time', async () => {
    const a = await issueClientInvite(input);
    supabase = createFakeSupabase();
    supabase.__setResponse('client_invites', { data: null, error: null });
    const b = await issueClientInvite(input);

    expect(a.url).not.toBe(b.url);
  });

  it('refuses an implausible email before touching the table', async () => {
    const result = await issueClientInvite({ ...input, email: 'nope' });

    expect(result.error).toMatch(/email address/);
    expect(supabase.__buildersFor('client_invites')).toHaveLength(0);
  });

  it('refuses a nameless invitation', async () => {
    expect((await issueClientInvite({ ...input, fullName: ' ' })).error).toMatch(/a name/);
  });

  it('records who issued it', async () => {
    await issueClientInvite(input);

    expect(inserted('client_invites').created_by).toBe('director-1');
  });
});

describe('revokeClientInvite', () => {
  it('withdraws only an unaccepted invitation', async () => {
    // Revoking an accepted one would suggest the seat had closed, which is a
    // different act on a different row.
    await revokeClientInvite('inv-1');

    const builder = supabase.__buildersFor('client_invites')[0];
    expect(builder!.eq).toHaveBeenCalledWith('id', 'inv-1');
    expect(builder!.is).toHaveBeenCalledWith('accepted_at', null);
  });
});

describe('setClientSeatStatus', () => {
  it('disables a seat without deleting the person', async () => {
    await setClientSeatStatus('user-1', 'disabled');

    const patch = supabase.__buildersFor('client_users')[0]!.update.mock.calls[0]![0];
    expect(patch).toEqual({ status: 'disabled' });
  });
});

describe('setSubscriptionStatus', () => {
  it('moves the account through its lifecycle', async () => {
    await setSubscriptionStatus('acct-1', 'active');

    const patch = supabase.__buildersFor('client_accounts')[0]!.update.mock.calls[0]![0];
    expect(patch).toEqual({ subscription_status: 'active' });
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;
    expect(await setSubscriptionStatus('acct-1', 'active')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});
