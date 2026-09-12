import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_INVITE_DAYS,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  inviteUrl,
  isPlausibleEmail,
  mintInviteToken,
} from './invite';

describe('mintInviteToken', () => {
  it('is base64url, so it survives being put in a URL', () => {
    expect(mintInviteToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('carries 32 bytes of entropy', () => {
    expect(Buffer.from(mintInviteToken(), 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 100 }, mintInviteToken));

    expect(tokens.size).toBe(100);
  });
});

describe('hashInviteToken', () => {
  it('produces lowercase hex sha256', () => {
    expect(hashInviteToken('test-token-abc123')).toBe(
      'cf4010a222820897c674b3247f8a1cb04b3a0b71ef6930384f6320a7d28e38df',
    );
  });

  it('matches what redeem_client_invite computes', () => {
    // This is the assertion the whole module rests on. `redeem_client_invite`
    // looks a redemption up by encode(digest(token,'sha256'),'hex'); if this
    // ever diverged, every invitation would fail with the deliberately vague
    // "invitation is not valid" and nothing would say why.
    //
    // Pinned as a literal above rather than only compared here, because this
    // case is skipped wherever psql is absent — CI included.
    let pg: string;
    try {
      pg = execFileSync(
        'psql',
        ['-qtAc', "SELECT encode(digest('test-token-abc123','sha256'),'hex');"],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
    } catch {
      return;
    }

    if (pg) expect(hashInviteToken('test-token-abc123')).toBe(pg);
  });

  it('is stable for the same input', () => {
    expect(hashInviteToken('x')).toBe(hashInviteToken('x'));
  });
});

describe('inviteExpiry', () => {
  it('defaults to a fortnight', () => {
    const from = new Date('2026-09-12T00:00:00Z');

    expect(inviteExpiry(DEFAULT_INVITE_DAYS, from)).toBe('2026-09-26T00:00:00.000Z');
  });

  it('takes a caller-supplied window', () => {
    expect(inviteExpiry(1, new Date('2026-09-12T00:00:00Z'))).toBe('2026-09-13T00:00:00.000Z');
  });
});

describe('isPlausibleEmail', () => {
  it.each(['a@b.co', 'first.last+tag@example.com.au'])('accepts %s', (email) => {
    expect(isPlausibleEmail(email)).toBe(true);
  });

  it.each(['', 'nope', 'a@b', 'a b@c.com', '@example.com'])('rejects %s', (email) => {
    expect(isPlausibleEmail(email)).toBe(false);
  });

  it('rejects an address past the length a mail server would take', () => {
    expect(isPlausibleEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('inviteState', () => {
  const future = '2099-01-01T00:00:00Z';
  const past = '2000-01-01T00:00:00Z';

  it('is open before it is used or expires', () => {
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: future })).toBe('open');
  });

  it('is expired once the window closes', () => {
    expect(inviteState({ acceptedAt: null, revokedAt: null, expiresAt: past })).toBe('expired');
  });

  it('is revoked when it was withdrawn', () => {
    expect(inviteState({ acceptedAt: null, revokedAt: past, expiresAt: future })).toBe('revoked');
  });

  it('stays accepted after its expiry passes', () => {
    // Someone using their seat should not read as "expired" because the
    // invitation they accepted last year has aged out.
    expect(inviteState({ acceptedAt: past, revokedAt: null, expiresAt: past })).toBe('accepted');
  });

  it('reports accepted ahead of revoked', () => {
    expect(inviteState({ acceptedAt: past, revokedAt: past, expiresAt: future })).toBe('accepted');
  });
});

describe('inviteUrl', () => {
  it('points at the client app, not this one', () => {
    expect(inviteUrl('https://minute.btreasury.com.au', 'tok')).toBe(
      'https://minute.btreasury.com.au/invite/tok',
    );
  });

  it('tolerates a trailing slash on the base', () => {
    expect(inviteUrl('https://minute.example/', 'tok')).toBe('https://minute.example/invite/tok');
  });
});
