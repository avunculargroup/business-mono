import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@platform/db';
import { decideGate } from '@/lib/gates';

/**
 * Two gates in sequence: authenticated, then disclosure-current.
 *
 * The decision itself is in `lib/gates.ts` and is tested there. This function
 * does the I/O — refresh the session, ask the two questions — and applies what
 * `decideGate` says. Keeping them apart is what makes the gate testable at all:
 * the rules are the part that must not be wrong, and they do not need a request
 * to exercise.
 *
 * The middleware is not the only enforcement. Every repository read rejects a
 * session that has not acknowledged, and every table a subscriber can reach is
 * behind an RLS policy. Three layers, because this one runs on the edge and a
 * matcher is an easy thing to get subtly wrong.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  let isSubscriber = false;
  let disclosureCurrent = false;

  if (user) {
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('id, status')
      .eq('id', user.id)
      .maybeSingle();

    isSubscriber = clientUser?.status === 'active';

    if (isSubscriber) {
      // The active Service Statement is the document the gate is about, and a
      // new version re-triggers it for everyone: the acknowledgement is
      // recorded against a version, so bumping the version means nobody has
      // acknowledged the current one yet.
      //
      // None active means nobody passes. That is correct while one has not been
      // written — see docs/features/client-app/build-progress.md on A4 — and it
      // fails closed rather than open.
      const { data: statement } = await supabase
        .from('compliance_documents')
        .select('version')
        .eq('doc_type', 'service_statement')
        .eq('status', 'active')
        .maybeSingle();

      if (statement?.version) {
        const { data: ack } = await supabase
          .from('client_disclosures')
          .select('id')
          .eq('client_user_id', user.id)
          .eq('document_version', statement.version)
          .maybeSingle();

        disclosureCurrent = ack !== null;
      }
    }
  }

  const decision = decideGate({
    pathname,
    hasSession: user !== null,
    isSubscriber,
    disclosureCurrent,
  });

  if (decision.kind === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }

  return supabaseResponse;
}

export const config = {
  // Static assets and the favicon are excluded; everything else passes through,
  // including routes that do not exist yet. A matcher that lists routes is a
  // matcher that forgets one.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
