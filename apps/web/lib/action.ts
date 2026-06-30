import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthedResult =
  | { ok: true; supabase: SupabaseServerClient; user: User }
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
