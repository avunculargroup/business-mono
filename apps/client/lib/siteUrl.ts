/**
 * Where a magic link comes back to.
 *
 * Supabase decides a magic link's destination when it *sends* the mail, not
 * when the link is clicked: with no `emailRedirectTo` the link points at the
 * project's configured Site URL, which on a fresh project is localhost. A
 * subscriber then receives a link to a machine that is not theirs and does not
 * resolve. So both send paths pass an origin explicitly, and both take it from
 * here.
 *
 * Deliberately an environment variable rather than the request's `Host` header.
 * A header is attacker-controllable, and a sign-in link whose origin an
 * attacker chose is a sign-in link addressed to the attacker. Supabase's
 * redirect allow-list would catch it, but an allow-list is the second line and
 * should not be the only one.
 */

/** Deployed origin. Used whenever `NEXT_PUBLIC_SITE_URL` is unset. */
export const DEFAULT_SITE_ORIGIN = 'https://minute.btreasury.com.au';

/**
 * The origin to build magic-link callbacks from, with no trailing slash.
 *
 * The slash matters: GoTrue matches redirect URLs exactly, so a variable set to
 * `https://minute.btreasury.com.au/` would produce `…//auth/callback` and be
 * rejected as unregistered — presenting as a sign-in link that goes nowhere,
 * which is the bug this module exists to prevent.
 */
export function siteOrigin(): string {
  const configured = process.env['NEXT_PUBLIC_SITE_URL']?.trim();
  const origin = configured ? configured : DEFAULT_SITE_ORIGIN;
  return origin.replace(/\/+$/, '');
}
