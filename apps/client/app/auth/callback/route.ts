import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Where a magic link lands.
 *
 * Exchanges the code for a session, then — if the link carried an invitation
 * token — redeems it. Redemption happens here rather than on the invite page
 * because it needs a session: `redeem_client_invite` seats `auth.uid()`, and
 * before the exchange there is no `auth.uid()` to seat.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const invite = searchParams.get('invite');

  if (!code) return NextResponse.redirect(new URL('/login', origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return NextResponse.redirect(new URL('/login?error=link', origin));

  if (invite) {
    const { error: redeemError } = await supabase.rpc('redeem_client_invite', {
      invite_token: invite,
    });

    // A failed redemption leaves a signed-in session with no seat, which the
    // middleware sends to /no-access. That page explains the two ways to get
    // there, and both of them are true here.
    if (redeemError) return NextResponse.redirect(new URL('/no-access', origin));
  }

  // Straight to the disclosure gate, which the middleware enforces anyway. Sent
  // here explicitly so the first thing a new subscriber sees is the Service
  // Statement rather
  // than a redirect from a page they never asked for.
  return NextResponse.redirect(new URL('/', origin));
}
