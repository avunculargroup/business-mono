import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@platform/db';
import type { Principal, ReadContext } from '@platform/data';

/** The cookie-authed client both `apps/web` server and browser clients produce. */
export type PlatformSupabaseClient = SupabaseClient<Database>;

/**
 * What every domain implementation closes over.
 *
 * This is the scoping rule made concrete: a domain receives its client and its
 * principal once, at construction, and never as a method argument. A domain
 * that needs to know who is asking reads it from here; a caller has no way to
 * supply a different answer.
 */
export interface SupabaseAdapterContext {
  readonly client: PlatformSupabaseClient;
  readonly principal: Principal;
}

export function createAdapterContext(
  client: PlatformSupabaseClient,
  principal: Principal,
): SupabaseAdapterContext {
  return Object.freeze({ client, principal });
}

/**
 * Fills in `ReadContext` defaults for `apps/web` call sites.
 *
 * `asOf` earns its place in the demo, where it keeps fixture dates from going
 * stale, and buys the real app nothing while adding a parameter to every call.
 * Defaulting it here is what stops that cost landing as boilerplate on ~200
 * call sites.
 */
export function resolveReadContext(ctx?: Partial<ReadContext>): ReadContext {
  return { asOf: ctx?.asOf ?? new Date() };
}
