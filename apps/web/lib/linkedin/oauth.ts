/**
 * LinkedIn OAuth 2.0 helpers (3-legged authorization-code flow).
 *
 * Pure functions over fetch — the route handlers in
 * app/api/integrations/linkedin/ own cookies, DB state, and redirects.
 * Access tokens last 60 days; standard apps get no refresh token, so
 * "refresh" is simply re-running this flow from the settings page.
 * Spec: docs/features/linkedin-posting/feature-spec.md
 */

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export const MEMBER_SCOPES = ['openid', 'profile', 'w_member_social'];
// Company-page posting (Phase 3) additionally needs the Community Management
// API product approved on the LinkedIn app.
export const COMPANY_SCOPES = [...MEMBER_SCOPES, 'w_organization_social'];

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', params.scopes.join(' '));
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  expiresAt: string; // ISO timestamp
  scopes: string[];
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn token exchange failed: ${res.status}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    scopes: body.scope ? body.scope.split(/[ ,]+/) : [],
  };
}

/** The authenticated member's URN, from the OpenID userinfo endpoint. */
export async function fetchMemberUrn(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed: ${res.status}`);
  }
  const body = (await res.json()) as { sub: string };
  return `urn:li:person:${body.sub}`;
}

const ORG_ACLS_URL =
  'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED';

/**
 * The organization URN the member administers (Phase 3, company-page connect —
 * requires the w_organization_social scope). BTS has one page; if the member
 * ever admins several, the first approved one wins.
 */
export async function fetchOrganizationUrn(accessToken: string): Promise<string> {
  const res = await fetch(ORG_ACLS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn organizationAcls failed: ${res.status}`);
  }
  const body = (await res.json()) as { elements?: Array<{ organization: string }> };
  const orgUrn = body.elements?.[0]?.organization;
  if (!orgUrn) {
    throw new Error('LinkedIn organizationAcls returned no administered organization');
  }
  return orgUrn;
}
