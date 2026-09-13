import { createHash, randomBytes } from 'node:crypto';

/**
 * Minting an invitation to Minute.
 *
 * The whole of this module exists because `client_invites` stores
 * `token_hash`, never the token. `redeem_client_invite` looks a redemption up
 * by `encode(digest(invite_token, 'sha256'), 'hex')`, so issuance has to
 * produce exactly that — and it does it here, in Node, so the plaintext token
 * never travels to Postgres at all. Not in a parameter, not in a query log, not
 * in a `pg_stat_statements` row.
 *
 * The consequence for the UI is the important one: **the token is shown once
 * and cannot be recovered.** There is nothing to look it up from. A page that
 * offered "resend" would have to mint a new one, and it should say so.
 */

/**
 * 32 bytes, base64url.
 *
 * Base64url rather than hex because the token goes in a URL and hex would make
 * it twice as long for the same entropy. 32 bytes is well past the point where
 * guessing matters against a table that also expires rows.
 */
export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The hash as `redeem_client_invite` computes it.
 *
 * Verified against Postgres rather than assumed: `encode(digest(x, 'sha256'),
 * 'hex')` and Node's `createHash('sha256').digest('hex')` produce the same
 * lowercase hex, and a mismatch here would mean every invitation ever issued
 * failed to redeem with the deliberately vague "invitation is not valid".
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Days an invitation stays open, unless a caller says otherwise. */
export const DEFAULT_INVITE_DAYS = 14;

export function inviteExpiry(days: number = DEFAULT_INVITE_DAYS, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

/**
 * Whether an address is worth sending to.
 *
 * Deliberately shallow. `redeem_client_invite` matches the invitation's email
 * against the authenticated user's, so a typo does not let the wrong person in
 * — it just produces an invitation nobody can accept. This catches the obvious
 * mistakes and leaves the rest to the redemption check.
 */
export function isPlausibleEmail(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

export type InviteState = 'accepted' | 'revoked' | 'expired' | 'open';

/**
 * What an invitation row currently is.
 *
 * Precedence matters and is not alphabetical: accepted beats everything,
 * because an accepted invitation that later passes its expiry is still an
 * accepted invitation, and showing it as "expired" would suggest the seat had
 * lapsed when the person is using it.
 */
export function inviteState(
  invite: { acceptedAt: string | null; revokedAt: string | null; expiresAt: string },
  now: Date = new Date(),
): InviteState {
  if (invite.acceptedAt) return 'accepted';
  if (invite.revokedAt) return 'revoked';
  if (Date.parse(invite.expiresAt) <= now.getTime()) return 'expired';
  return 'open';
}

/** The link a subscriber follows. Relative to the client app, not this one. */
export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/invite/${token}`;
}
