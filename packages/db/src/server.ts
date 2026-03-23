import { createServerClient as _createServerClient } from '@supabase/ssr';
import type { Database } from './types/database.js';

type CookieMethods = {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
};

/**
 * Create a Supabase client for server-side usage (server components, server actions, middleware).
 * Uses the anon key with cookie-based auth — RLS enforces access control.
 */
export function createServerSupabaseClient(cookies: CookieMethods) {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }

  return _createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookies.setAll(cookiesToSet);
      },
    },
  });
}
