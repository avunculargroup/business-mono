/**
 * The two gates, as a pure decision.
 *
 * Extracted from `middleware.ts` so it can be tested without a request, a
 * cookie jar or a Supabase client. The middleware does the I/O and calls this;
 * this decides. Every case below is a case the middleware would otherwise only
 * be exercised on by clicking around, and the gate is the one thing in the app
 * that must not be wrong.
 */

/** Routes reachable with no session at all. */
export const PUBLIC_PREFIXES = ['/login', '/invite', '/auth'] as const;

/**
 * The only route a signed-in but un-acknowledged session may reach.
 *
 * `/logout` is on the list because a subscriber who does not want to accept the
 * Service Statement must be able to leave. A gate with no exit is a trap, and a
 * trap produces a support call rather than a decision.
 */
export const DISCLOSURE_PREFIXES = ['/disclosure', '/logout'] as const;

export interface GateInput {
  pathname: string;
  hasSession: boolean;
  /** Null when the session is not a subscriber at all — staff, or no row. */
  isSubscriber: boolean;
  disclosureCurrent: boolean;
}

export type GateDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string };

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Authenticated, then disclosure-current. In that order, always.
 *
 * The order matters and is not interchangeable: asking whether a disclosure is
 * current for a session that does not exist is a question with no answer, and
 * the version that answers it anyway is the version that lets an unauthenticated
 * request through on a null.
 */
export function decideGate(input: GateInput): GateDecision {
  const { pathname, hasSession, isSubscriber, disclosureCurrent } = input;

  const isPublic = startsWithAny(pathname, PUBLIC_PREFIXES);

  // Gate one.
  if (!hasSession) {
    return isPublic
      ? { kind: 'allow' }
      : { kind: 'redirect', to: `/login?redirect=${encodeURIComponent(pathname)}` };
  }

  // A signed-in user with no client_users row is staff, or someone whose seat
  // was disabled. Neither belongs here, and neither should see a half-rendered
  // app: they go to a page that says so.
  if (!isSubscriber) {
    return pathname === '/no-access'
      ? { kind: 'allow' }
      : { kind: 'redirect', to: '/no-access' };
  }

  // A signed-in subscriber has no reason to see the login page.
  if (startsWithAny(pathname, ['/login'])) {
    return { kind: 'redirect', to: '/' };
  }

  // Gate two.
  if (!disclosureCurrent) {
    return startsWithAny(pathname, DISCLOSURE_PREFIXES)
      ? { kind: 'allow' }
      : { kind: 'redirect', to: '/disclosure' };
  }

  // Acknowledged. The gate has nothing left to say, and re-showing it would
  // teach the subscriber to click through it without reading.
  if (startsWithAny(pathname, ['/disclosure'])) {
    return { kind: 'redirect', to: '/' };
  }

  return { kind: 'allow' };
}
