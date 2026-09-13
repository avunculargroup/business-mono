import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { ClientDatabase } from '@platform/db';

/**
 * The cookie-authed client, typed against the schema the client-app migrations
 * create.
 *
 * Anon key only. There is no service-role client anywhere in this app and there
 * must not be: every tenancy guarantee Minute makes is an RLS policy, and the
 * service role bypasses all of them. `lib/boundary.test.ts` asserts the string
 * never appears in any source file here.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<ClientDatabase>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
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
            // setAll can be called from a Server Component where cookies are
            // read-only. Safe to ignore while middleware refreshes the session.
          }
        },
      },
    },
  );
}
