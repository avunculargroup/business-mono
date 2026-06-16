import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractBody,
  shouldSkipEmail,
  FastmailJmapClient,
  JmapAuthError,
} from './fastmailJmap.js';
import { buildJmapEmail } from '../../test/factories.js';

describe('extractBody', () => {
  it('prefers plain text body when present', () => {
    const email = buildJmapEmail({ textBody: 'plain text', htmlBody: '<p>html</p>' });
    expect(extractBody(email)).toBe('plain text');
  });

  it('falls back to HTML with tags stripped when text is blank', () => {
    const email = buildJmapEmail({ textBody: '   ', htmlBody: '<p>html <b>body</b></p>' });
    expect(extractBody(email)).toBe('html body');
  });

  it('strips <style> and <script> blocks before extracting', () => {
    const email = buildJmapEmail({
      textBody: '',
      htmlBody: '<style>p{color:red}</style><script>alert(1)</script><p>visible</p>',
    });
    const out = extractBody(email);
    expect(out).toContain('visible');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('color:red');
  });

  it('decodes common HTML entities', () => {
    const email = buildJmapEmail({
      textBody: '',
      htmlBody: '<p>Tom &amp; Jerry &lt;3 &quot;cheese&quot;</p>',
    });
    expect(extractBody(email)).toBe('Tom & Jerry <3 "cheese"');
  });

  it('returns empty string when neither body is usable', () => {
    const email = buildJmapEmail({ textBody: '', htmlBody: '' });
    // textBody=='' makes the factory skip the text body part entirely
    expect(extractBody(email)).toBe('');
  });

  it('caps a pathologically large HTML body before the regex chain runs', () => {
    // A multi-MB HTML body must not be fed whole into stripHtml's chained global
    // .replace() passes — that is the OOM site (Runtime_RegExpReplaceRT) on the
    // memory-constrained agents host. Truncating mid-markup is acceptable here.
    const huge = '<p>' + 'a'.repeat(3_000_000) + '</p>';
    const email = buildJmapEmail({ textBody: '', htmlBody: huge });
    const out = extractBody(email);
    expect(out.length).toBeLessThanOrEqual(1_000_000);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('shouldSkipEmail', () => {
  it('skips emails flagged as spam by X-Spam-Status', () => {
    expect(shouldSkipEmail([{ name: 'X-Spam-Status', value: 'Yes, score=8.0' }])).toBe(true);
  });

  it('skips emails flagged by X-Spam-Flag', () => {
    expect(shouldSkipEmail([{ name: 'X-Spam-Flag', value: 'YES' }])).toBe(true);
  });

  it('skips emails with numeric spam score >= 5.0', () => {
    expect(shouldSkipEmail([{ name: 'X-Spam-Score', value: '5.5' }])).toBe(true);
    expect(shouldSkipEmail([{ name: 'X-Spam-Score', value: '4.9' }])).toBe(false);
  });

  it('skips bulk / list / junk precedence', () => {
    expect(shouldSkipEmail([{ name: 'Precedence', value: 'bulk' }])).toBe(true);
    expect(shouldSkipEmail([{ name: 'Precedence', value: 'list' }])).toBe(true);
    expect(shouldSkipEmail([{ name: 'Precedence', value: 'first-class' }])).toBe(false);
  });

  it('skips mailing-list email (List-Unsubscribe header present)', () => {
    expect(shouldSkipEmail([{ name: 'List-Unsubscribe', value: '<mailto:u@x>' }])).toBe(true);
  });

  it('skips campaign tracking and Mailchimp', () => {
    expect(shouldSkipEmail([{ name: 'X-Campaign-Id', value: 'abc' }])).toBe(true);
    expect(shouldSkipEmail([{ name: 'X-MailChimp-User', value: 'x' }])).toBe(true);
  });

  it('skips auto-generated mail', () => {
    expect(shouldSkipEmail([{ name: 'Auto-Submitted', value: 'auto-generated' }])).toBe(true);
    expect(shouldSkipEmail([{ name: 'Auto-Submitted', value: 'no' }])).toBe(false);
  });

  it('matches header names case-insensitively', () => {
    expect(shouldSkipEmail([{ name: 'list-unsubscribe', value: 'x' }])).toBe(true);
  });

  it('keeps normal emails', () => {
    expect(shouldSkipEmail([{ name: 'From', value: 'alice@example.com' }])).toBe(false);
    expect(shouldSkipEmail([])).toBe(false);
  });
});

describe('FastmailJmapClient', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getSession returns accountId + apiUrl on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          primaryAccounts: { 'urn:ietf:params:jmap:mail': 'acc_xyz' },
          apiUrl: 'https://api.fastmail.com/jmap/api/',
        }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const out = await client.getSession();
    expect(out).toEqual({ accountId: 'acc_xyz', apiUrl: 'https://api.fastmail.com/jmap/api/' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fastmail.com/.well-known/jmap',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('getSession throws JmapAuthError on 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const client = new FastmailJmapClient('user@example.com', 'bad');
    await expect(client.getSession()).rejects.toBeInstanceOf(JmapAuthError);
  });

  it('getSession throws when no mail accountId is present', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ primaryAccounts: {}, apiUrl: 'https://api.fastmail.com/jmap/api/' }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    await expect(client.getSession()).rejects.toThrow(/No mail accountId/);
  });

  it('getEmails returns [] without calling fetch when ids empty', async () => {
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const out = await client.getEmails('acc', 'https://api/', []);
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queryEmailIds uses Email/queryChanges when sinceQueryState is provided', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          methodResponses: [['Email/queryChanges', { newQueryState: 'qs2', added: [{ id: 'e1' }, { id: 'e2' }] }, 'eq']],
        }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const out = await client.queryEmailIds('acc', 'https://api/', 'mb_inbox', 'qs1');
    expect(out.emailIds).toEqual(['e1', 'e2']);
    expect(out.newQueryState).toBe('qs2');
    expect(out.didFallback).toBe(false);
  });

  it('queryEmailIds falls back to Email/query when queryChanges reports cannotCalculateChanges', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            methodResponses: [['Email/queryChanges', { error: { type: 'cannotCalculateChanges' }, newQueryState: '', added: [] }, 'eq']],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            methodResponses: [['Email/query', { queryState: 'fresh-qs', ids: ['e1'] }, 'eq']],
          }),
          { status: 200 },
        ),
      );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const out = await client.queryEmailIds('acc', 'https://api/', 'mb_inbox', 'old-qs');
    expect(out.emailIds).toEqual(['e1']);
    expect(out.newQueryState).toBe('fresh-qs');
    expect(out.didFallback).toBe(true);
  });

  it('queryEmailIds without sinceQueryState runs a fresh Email/query', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          methodResponses: [['Email/query', { queryState: 'qs0', ids: ['a', 'b'] }, 'eq']],
        }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const out = await client.queryEmailIds('acc', 'https://api/', 'mb', undefined);
    expect(out).toEqual({ emailIds: ['a', 'b'], newQueryState: 'qs0', didFallback: true });
  });
});
