import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { ClientDatabase } from '@platform/db';

/**
 * Typed against `ClientDatabase`, not `Database`.
 *
 * `Database` is generated from the live schema, which does not yet have the
 * client-app tables — the compliance queue at `/compliance` reads two of them.
 * `ClientDatabase` is that generated type plus the hand-written bridge in
 * `@platform/db`, so it is a superset: every existing query keeps its types and
 * the two new ones gain theirs.
 *
 * This reverts to `Database` when the migrations are applied and the bridge is
 * deleted. `packages/db/src/types/pendingClientTables.test.ts` is the reminder.
 */

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<ClientDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll can be called from a Server Component where cookies are read-only.
            // This can be ignored if middleware is refreshing the session.
          }
        },
      },
    }
  );
}
