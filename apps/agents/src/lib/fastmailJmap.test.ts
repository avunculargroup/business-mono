import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractBody,
  shouldSkipEmail,
  FastmailJmapClient,
  JmapAuthError,
  findHeader,
  getMessageId,
  parseAuthResults,
  isAuthFail,
  parsePlusTag,
  extractResearchSlug,
  attachmentCount,
  hasPdfAttachment,
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

describe('header / address helpers', () => {
  describe('findHeader', () => {
    it('matches case-insensitively and returns the first value', () => {
      const headers = [
        { name: 'Message-ID', value: '<a@x>' },
        { name: 'message-id', value: '<b@x>' },
      ];
      expect(findHeader(headers, 'message-id')).toBe('<a@x>');
      expect(findHeader(headers, 'Nope')).toBeUndefined();
    });
  });

  describe('getMessageId', () => {
    it('strips angle brackets', () => {
      const email = buildJmapEmail({ headers: [{ name: 'Message-ID', value: '  <abc.123@mail> ' }] });
      expect(getMessageId(email)).toBe('abc.123@mail');
    });
    it('handles the Message-Id casing variant', () => {
      const email = buildJmapEmail({ headers: [{ name: 'Message-Id', value: '<x@y>' }] });
      expect(getMessageId(email)).toBe('x@y');
    });
    it('returns null when absent', () => {
      expect(getMessageId(buildJmapEmail({ headers: [] }))).toBeNull();
    });
  });

  describe('parseAuthResults', () => {
    it('parses spf, dkim and dmarc verdicts from one header', () => {
      const headers = [{
        name: 'Authentication-Results',
        value: 'mx.fastmail.com; dkim=pass header.d=gromen.com; spf=pass smtp.mailfrom=gromen.com; dmarc=pass',
      }];
      expect(parseAuthResults(headers)).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'pass' });
    });
    it('takes the first verdict per method across multiple headers', () => {
      const headers = [
        { name: 'Authentication-Results', value: 'a; spf=fail' },
        { name: 'Authentication-Results', value: 'b; dkim=pass' },
      ];
      expect(parseAuthResults(headers)).toEqual({ spf: 'fail', dkim: 'pass', dmarc: null });
    });
    it('returns nulls when no Authentication-Results header is present', () => {
      expect(parseAuthResults([{ name: 'From', value: 'x' }])).toEqual({ spf: null, dkim: null, dmarc: null });
    });
  });

  describe('isAuthFail', () => {
    it('is true when spf or dkim failed', () => {
      expect(isAuthFail([{ name: 'Authentication-Results', value: 'x; spf=fail; dkim=pass' }])).toBe(true);
      expect(isAuthFail([{ name: 'Authentication-Results', value: 'x; spf=pass; dkim=fail' }])).toBe(true);
    });
    it('is false for pass / softfail / none / missing', () => {
      expect(isAuthFail([{ name: 'Authentication-Results', value: 'x; spf=pass; dkim=pass' }])).toBe(false);
      expect(isAuthFail([{ name: 'Authentication-Results', value: 'x; spf=softfail' }])).toBe(false);
      expect(isAuthFail([])).toBe(false);
    });
  });

  describe('parsePlusTag', () => {
    it('extracts the tag after the plus, lowercased', () => {
      expect(parsePlusTag('research+Gromen@btreasury.com.au')).toBe('gromen');
    });
    it('returns null when there is no plus tag', () => {
      expect(parsePlusTag('research@btreasury.com.au')).toBeNull();
      expect(parsePlusTag('research+@x')).toBeNull();
    });
  });

  describe('extractResearchSlug', () => {
    it('finds the plus tag from a To recipient', () => {
      const email = buildJmapEmail({ to: [{ email: 'research+bitwise@btreasury.com.au' }] });
      expect(extractResearchSlug(email)).toBe('bitwise');
    });
    it('scans Cc when To has no plus tag', () => {
      const email = buildJmapEmail({
        to: [{ email: 'someone@btreasury.com.au' }],
        cc: [{ email: 'research+alden@btreasury.com.au' }],
      });
      expect(extractResearchSlug(email)).toBe('alden');
    });
    it('returns null when no recipient is plus-addressed', () => {
      const email = buildJmapEmail({ to: [{ email: 'plain@btreasury.com.au' }], cc: [] });
      expect(extractResearchSlug(email)).toBeNull();
    });
  });

  describe('attachment helpers', () => {
    it('counts attachment-disposition and named parts', () => {
      const email = buildJmapEmail({
        attachments: [
          { type: 'application/pdf', name: 'memo.pdf', disposition: 'attachment' },
          { type: 'image/png', name: null, disposition: 'inline' }, // tracking pixel — not counted
        ],
      });
      expect(attachmentCount(email)).toBe(1);
    });
    it('detects a PDF by MIME type or .pdf filename', () => {
      expect(hasPdfAttachment(buildJmapEmail({ attachments: [{ type: 'application/pdf' }] }))).toBe(true);
      expect(hasPdfAttachment(buildJmapEmail({ attachments: [{ type: 'application/octet-stream', name: 'Report.PDF' }] }))).toBe(true);
      expect(hasPdfAttachment(buildJmapEmail({ attachments: [{ type: 'image/png', name: 'logo.png' }] }))).toBe(false);
      expect(hasPdfAttachment(buildJmapEmail({}))).toBe(false);
    });
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

  it('getMailboxIdByName resolves a folder case-insensitively', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          methodResponses: [['Mailbox/get', { list: [
            { id: 'mb_inbox', name: 'Inbox', role: 'inbox' },
            { id: 'mb_research', name: 'Research', role: null },
          ] }, 'mb']],
        }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const id = await client.getMailboxIdByName('acc', 'https://api/', 'research');
    expect(id).toBe('mb_research');
  });

  it('getMailboxIdByName returns null when the folder does not exist', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          methodResponses: [['Mailbox/get', { list: [{ id: 'mb_inbox', name: 'Inbox', role: 'inbox' }] }, 'mb']],
        }),
        { status: 200 },
      ),
    );
    const client = new FastmailJmapClient('user@example.com', 'tok');
    const id = await client.getMailboxIdByName('acc', 'https://api/', 'Research');
    expect(id).toBeNull();
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
