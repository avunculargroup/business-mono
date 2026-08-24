import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseRepositories } from '@platform/data-supabase';
import type { Principal, RepositoryBundle } from '@platform/data';

/**
 * Resolve the signed-in principal for this request.
 *
 * `cache()` dedupes it across the render pass, so a layout and every page and
 * server action under it share one `auth.getUser()` round trip rather than one
 * each. Without it, moving pages behind repositories would add an auth call per
 * page purely as a side effect of the refactor.
 */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { kind: 'team', userId: user.id } : null;
});

/**
 * The repository bundle for a page.
 *
 * Throws when signed out rather than returning null: every page under
 * `app/(app)/` renders behind the layout's auth gate and middleware, so no user
 * here means the gate has been bypassed, and failing loudly beats rendering an
 * empty page as though there were no data. Server actions are the callable-
 * from-anywhere case and use `getAuthedRepositories` in `lib/action.ts`, which
 * returns an error instead.
 */
export async function getRepositories(): Promise<RepositoryBundle> {
  const [supabase, principal] = await Promise.all([createClient(), getPrincipal()]);

  if (!principal) {
    throw new Error('getRepositories called without a signed-in user');
  }

  return createSupabaseRepositories(supabase, principal);
}
