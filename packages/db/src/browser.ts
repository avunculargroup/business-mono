import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
import type { Database } from './types/database.js';

let browserClient: ReturnType<typeof _createBrowserClient<Database>> | null = null;

/**
 * Create a singleton Supabase client for browser-side usage (client components, real-time).
 * Uses the anon key with cookie-based auth — RLS enforces access control.
 */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }

  browserClient = _createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
