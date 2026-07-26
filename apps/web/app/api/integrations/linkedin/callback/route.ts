import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCode, fetchMemberUrn, fetchOrganizationUrn } from '@/lib/linkedin/oauth';

const SETTINGS_PATH = '/settings/integrations/linkedin';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function settingsRedirect(requestUrl: string, params: Record<string, string>) {
  const url = new URL(SETTINGS_PATH, requestUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/**
 * LinkedIn OAuth callback: validates the CSRF state, exchanges the code,
 * resolves the author URN, and upserts the account's social_credentials row.
 * Re-connecting an account overwrites its previous (possibly expired) token.
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
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  // User declined on LinkedIn's consent screen, or LinkedIn errored.
  const oauthError = requestUrl.searchParams.get('error');
  if (oauthError || !code || !state) {
    return settingsRedirect(request.url, { error: oauthError ?? 'missing_code' });
  }

  // Validate + consume the CSRF state (single use).
  const { data: stateRow } = await supabase
    .from('oauth_states')
    .select('state, social_account_id, created_at')
    .eq('state', state)
    .single();
  if (stateRow) {
    await supabase.from('oauth_states').delete().eq('state', state);
  }
  if (!stateRow || Date.now() - new Date(stateRow.created_at).getTime() > STATE_MAX_AGE_MS) {
    return settingsRedirect(request.url, { error: 'invalid_state' });
  }

  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, account_type')
    .eq('id', stateRow.social_account_id)
    .single();
  if (!account) {
    return settingsRedirect(request.url, { error: 'unknown_account' });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return settingsRedirect(request.url, { error: 'not_configured' });
  }

  try {
    const token = await exchangeCode({
      code,
      clientId,
      clientSecret,
      redirectUri: new URL('/api/integrations/linkedin/callback', requestUrl.origin).toString(),
    });

    const authorUrn =
      account.account_type === 'company'
        ? await fetchOrganizationUrn(token.accessToken)
        : await fetchMemberUrn(token.accessToken);

    // The token goes into Supabase Vault via this wrapper, which also upserts
    // the credential row. The web app can store a token but never read one
    // back — social_credential_token() is granted to service_role only.
    const { error: storeError } = await supabase.rpc('store_social_credential', {
      p_social_account_id: account.id,
      p_author_urn: authorUrn,
      p_token: token.accessToken,
      p_expires_at: token.expiresAt,
      p_scopes: token.scopes,
      // team_members.id IS the auth user id (PK references auth.users).
      p_connected_by: user.id,
      p_provider: 'linkedin',
    });
    if (storeError) {
      return settingsRedirect(request.url, { error: 'store_failed' });
    }

    return settingsRedirect(request.url, { connected: '1' });
  } catch {
    return settingsRedirect(request.url, { error: 'exchange_failed' });
  }
}
