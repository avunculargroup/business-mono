import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@platform/db';

/** Anon key only, same rule as the server client. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  );
}
