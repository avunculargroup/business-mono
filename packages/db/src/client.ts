import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database.js';
import WebSocket from 'ws';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    timeout: 60000,
    heartbeatIntervalMs: 15000,
    // Node.js 20 has no native WebSocket; provide ws so Supabase Realtime
    // uses a real WebSocket instead of falling back to HTTP LongPoll.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: WebSocket as any,
  },
});
