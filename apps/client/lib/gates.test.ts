import { describe, expect, it } from 'vitest';
import { decideGate, type GateInput } from './gates';

function gate(overrides: Partial<GateInput> = {}) {
  return decideGate({
    pathname: '/',
    hasSession: true,
    isSubscriber: true,
    disclosureCurrent: true,
    ...overrides,
  });
}

describe('gate one — authenticated', () => {
  it('sends an anonymous request to login, carrying where it was going', () => {
    expect(gate({ pathname: '/register', hasSession: false })).toEqual({
      kind: 'redirect',
      to: '/login?redirect=%2Fregister',
    });
  });

  it.each(['/login', '/invite/abc123', '/auth/callback'])(
    'lets an anonymous request reach %s',
    (pathname) => {
      expect(gate({ pathname, hasSession: false })).toEqual({ kind: 'allow' });
    },
  );

  it('does not treat a path that merely starts with the same letters as public', () => {
    // `/loginable` is not `/login`. Prefix matching without the boundary check
    // is how a route accidentally becomes public.
    expect(gate({ pathname: '/loginable', hasSession: false })).toEqual({
      kind: 'redirect',
      to: '/login?redirect=%2Floginable',
    });
  });

  it('sends a signed-in subscriber away from the login page', () => {
    expect(gate({ pathname: '/login' })).toEqual({ kind: 'redirect', to: '/' });
  });
});

describe('gate two — disclosure current', () => {
  it('blocks every route for a session that has not acknowledged', () => {
    for (const pathname of ['/', '/register', '/prepare', '/account', '/signals']) {
      expect(gate({ pathname, disclosureCurrent: false })).toEqual({
        kind: 'redirect',
        to: '/disclosure',
      });
    }
  });

  it('lets that session reach the gate itself', () => {
    expect(gate({ pathname: '/disclosure', disclosureCurrent: false })).toEqual({
      kind: 'allow',
    });
  });

  it('lets that session sign out', () => {
    // A gate with no exit is a trap. A subscriber who will not accept the
    // Service Statement has to be able to leave.
    expect(gate({ pathname: '/logout', disclosureCurrent: false })).toEqual({
      kind: 'allow',
    });
  });

  it('sends an acknowledged session away from the gate', () => {
    expect(gate({ pathname: '/disclosure' })).toEqual({ kind: 'redirect', to: '/' });
  });

  it('runs after gate one, not alongside it', () => {
    // An anonymous request must reach login, not the disclosure gate — asking
    // whether a disclosure is current for a session that does not exist has no
    // answer, and answering it anyway is how an unauthenticated request gets in.
    expect(gate({ pathname: '/', hasSession: false, disclosureCurrent: false })).toEqual({
      kind: 'redirect',
      to: '/login?redirect=%2F',
    });
  });
});

describe('a signed-in non-subscriber', () => {
  it('is sent to a page that says so rather than into the app', () => {
    expect(gate({ pathname: '/', isSubscriber: false })).toEqual({
      kind: 'redirect',
      to: '/no-access',
    });
  });

  it('can reach that page', () => {
    expect(gate({ pathname: '/no-access', isSubscriber: false })).toEqual({ kind: 'allow' });
  });

  it('is caught before the disclosure gate, not after', () => {
    // Otherwise a founder who signed in here would be asked to acknowledge a
    // Service Statement that is not addressed to them.
    expect(
      gate({ pathname: '/', isSubscriber: false, disclosureCurrent: false }),
    ).toEqual({ kind: 'redirect', to: '/no-access' });
  });
});

describe('an acknowledged subscriber', () => {
  it.each(['/', '/signals', '/indicators', '/register', '/directory', '/library', '/prepare', '/account'])(
    'reaches %s',
    (pathname) => {
      expect(gate({ pathname })).toEqual({ kind: 'allow' });
    },
  );
});
