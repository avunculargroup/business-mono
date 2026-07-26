import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildAuthorizeUrl, COMPANY_SCOPES, MEMBER_SCOPES } from '@/lib/linkedin/oauth';

const SETTINGS_PATH = '/settings/integrations/linkedin';

/**
 * Begin the LinkedIn OAuth flow for one social account:
 * GET /api/integrations/linkedin/start?accountId=<social_accounts.id>
 * Persists a CSRF state row, then redirects to LinkedIn's consent screen.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const accountId = requestUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=missing_account`, request.url));
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=not_configured`, request.url));
  }

  const { data: account, error } = await supabase
    .from('social_accounts')
    .select('id, account_type, platform')
    .eq('id', accountId)
    .single();
  if (error || !account || account.platform !== 'linkedin') {
    return NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=unknown_account`, request.url));
  }

  const state = randomBytes(24).toString('hex');
  const { error: stateError } = await supabase
    .from('oauth_states')
    .insert({ state, social_account_id: accountId });
  if (stateError) {
    return NextResponse.redirect(new URL(`${SETTINGS_PATH}?error=state_failed`, request.url));
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri: new URL('/api/integrations/linkedin/callback', requestUrl.origin).toString(),
    state,
    scopes: account.account_type === 'company' ? COMPANY_SCOPES : MEMBER_SCOPES,
  });

  return NextResponse.redirect(authorizeUrl);
}
