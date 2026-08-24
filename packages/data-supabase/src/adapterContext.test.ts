import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@platform/data';
import {
  createAdapterContext,
  resolveReadContext,
  type PlatformSupabaseClient,
} from './adapterContext';

const principal: Principal = { kind: 'team', userId: 'user-1' };
const client = {} as PlatformSupabaseClient;

describe('createAdapterContext', () => {
  it('binds the principal at construction', () => {
    const ctx = createAdapterContext(client, principal);

    expect(ctx.principal).toEqual(principal);
    expect(ctx.client).toBe(client);
  });

  it('cannot be re-pointed at a different principal after construction', () => {
    // The security boundary is construction. A domain that closed over this
    // context must not be reachable by swapping the principal underneath it.
    const ctx = createAdapterContext(client, principal);

    expect(() => {
      (ctx as { principal: Principal }).principal = { kind: 'team', userId: 'someone-else' };
    }).toThrow();
    expect(ctx.principal.userId).toBe('user-1');
  });
});

describe('resolveReadContext', () => {
  it('defaults asOf to now so apps/web call sites can omit it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T03:00:00Z'));

    expect(resolveReadContext().asOf).toEqual(new Date('2026-08-19T03:00:00Z'));
    expect(resolveReadContext(undefined).asOf).toEqual(new Date('2026-08-19T03:00:00Z'));

    vi.useRealTimers();
  });

  it('keeps an explicit anchor, which is what the demo relies on', () => {
    const asOf = new Date('2026-01-01T00:00:00Z');

    expect(resolveReadContext({ asOf }).asOf).toBe(asOf);
  });
});
