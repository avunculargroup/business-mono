import type { User } from '@supabase/supabase-js';
import type { RepositoryBundle } from '@platform/data';
import { createSupabaseRepositories } from '@platform/data-supabase';
import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthedResult =
  | { ok: true; supabase: SupabaseServerClient; user: User }
  | { ok: false; error: string };

type AuthedRepositoriesResult =
  | { ok: true; repositories: RepositoryBundle; user: User }
  | { ok: false; error: string };

/**
 * Resolve the cookie-authed Supabase client and assert a signed-in user.
 *
 * Server actions run behind middleware that already redirects anonymous
 * requests, but the mutating actions historically created the client inline and
 * relied entirely on RLS — only ~13 of 34 checked the user. This helper makes
 * the auth contract uniform and trivially mockable: call it at the top of a
 * mutating action and early-return the error.
 *
 *   const auth = await getAuthedClient();
 *   if (!auth.ok) return { error: auth.error };
 *   const { supabase, user } = auth;
 */
export async function getAuthedClient(): Promise<AuthedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'You need to be signed in to do that.' };
  }

  return { ok: true, supabase, user };
}

/**
 * The repository equivalent of `getAuthedClient`, for actions that have been
 * converted to the seam.
 *
 * Same contract — call it at the top of a mutating action and early-return the
 * error — so converting an action is a one-line change at the top plus swapping
 * `supabase.from(...)` for a repository call:
 *
 *   const auth = await getAuthedRepositories();
 *   if (!auth.ok) return { error: auth.error };
 *   const { repositories } = auth;
 *
 * `getAuthedClient` stays until the last vertical lands; the two coexist while
 * the app is part-converted, which is what keeps every commit shippable.
 */
export async function getAuthedRepositories(): Promise<AuthedRepositoriesResult> {
  const auth = await getAuthedClient();
  if (!auth.ok) return auth;

  return {
    ok: true,
    repositories: createSupabaseRepositories(auth.supabase, {
      kind: 'team',
      userId: auth.user.id,
    }),
    user: auth.user,
  };
}
