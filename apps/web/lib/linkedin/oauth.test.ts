import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildAuthorizeUrl, exchangeCode, fetchMemberUrn, MEMBER_SCOPES } from './oauth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildAuthorizeUrl', () => {
  it('builds the LinkedIn authorization URL with space-joined scopes', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'cid',
        redirectUri: 'https://app.example.com/api/integrations/linkedin/callback',
        state: 'abc123',
        scopes: MEMBER_SCOPES,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('abc123');
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social');
  });
});

describe('exchangeCode', () => {
  it('posts the code and maps the token response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 5184000, scope: 'openid,profile,w_member_social' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const before = Date.now();
    const result = await exchangeCode({
      code: 'the-code',
      clientId: 'cid',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/cb',
    });

    expect(result.accessToken).toBe('tok');
    expect(result.scopes).toEqual(['openid', 'profile', 'w_member_social']);
    const expiresMs = new Date(result.expiresAt).getTime() - before;
    expect(expiresMs).toBeGreaterThan(5183000 * 1000);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_secret')).toBe('secret');
  });

  it('throws on a failed exchange', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(
      exchangeCode({ code: 'x', clientId: 'c', clientSecret: 's', redirectUri: 'r' }),
    ).rejects.toThrow('token exchange failed: 400');
  });
});

describe('fetchMemberUrn', () => {
  it('builds the person URN from the userinfo sub claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: 'AbC123' }) }),
    );
    expect(await fetchMemberUrn('tok')).toBe('urn:li:person:AbC123');
  });

  it('throws on a failed userinfo call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchMemberUrn('tok')).rejects.toThrow('userinfo failed: 401');
  });
});
