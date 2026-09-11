import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign out.
 *
 * A route rather than a page, and reachable from the disclosure gate: a
 * subscriber who will not accept the FSG has to be able to leave. A gate with
 * no exit produces a support call rather than a decision.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}
