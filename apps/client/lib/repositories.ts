import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { ClientDataContext, ReadContext } from '@platform/data';
import { createClientRepositories } from '@platform/data-supabase';
import { createClient } from './supabase/server';

/**
 * The client context for the current request.
 *
 * `cache()` scopes it to one render pass, which is exactly the lifetime the
 * adapter wants: its disclosure check is memoised on the context, so a bundle
 * living longer than a request would keep answering "acknowledged" after a new
 * Service Statement version went active, and the gate would stop re-triggering.
 *
 * Returns null rather than throwing when there is no session, so a public route
 * can ask without handling an exception.
 */
export const getClientRepositories = cache(async (): Promise<ClientDataContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // The account is resolved here, once, and bound into the bundle. Every
  // repository closes over it and no method takes an account id, so a page has
  // no way to ask about someone else's account even by accident.
  const { data: clientUser } = await supabase
    .from('client_users')
    .select('account_id, status')
    .eq('id', user.id)
    .maybeSingle();

  // A team member signing in here has no client_users row and gets nothing —
  // the disjointness triggers guarantee they never will. A disabled user is
  // the same: status is checked here and again in current_client_account_id(),
  // so revoking a seat takes effect on the next request.
  if (!clientUser || clientUser.status !== 'active') return null;

  return createClientRepositories(supabase, {
    kind: 'client',
    userId: user.id,
    accountId: clientUser.account_id,
  });
});

/**
 * The same, for a route that cannot render without one.
 *
 * Redirects rather than throwing: reaching a gated page without a session is an
 * ordinary thing that happens when a session expires in an open tab, and it
 * should look like being signed out rather than like an error.
 */
export async function requireClientRepositories(): Promise<ClientDataContext> {
  const repositories = await getClientRepositories();
  if (!repositories) redirect('/login');
  return repositories;
}

/**
 * `ReadContext` for a server render.
 *
 * `asOf` earns its place in the demo, where it keeps fixture dates from going
 * stale. Here it is always now, and defaulting it in one place is what stops
 * that landing as a parameter on every page.
 */
export function readContext(): ReadContext {
  return { asOf: new Date() };
}
