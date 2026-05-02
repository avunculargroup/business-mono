/**
 * Fastmail JMAP client
 *
 * Typed wrapper around the JMAP Core (RFC 8620) and JMAP Mail (RFC 8621) APIs
 * as implemented by Fastmail. Used by the Fastmail polling listener to do
 * incremental email sync via queryState.
 *
 * Auth: Fastmail app-specific passwords sent as Bearer tokens.
 * Session discovery: GET https://api.fastmail.com/.well-known/jmap
 */

const JMAP_WELL_KNOWN = 'https://api.fastmail.com/.well-known/jmap';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JmapAddress {
  name?: string;
  email: string;
}

export interface JmapEmail {
  id: string;
  subject: string | null;
  from: JmapAddress[] | null;
  to:   JmapAddress[] | null;
  cc:   JmapAddress[] | null;
  receivedAt: string; // ISO 8601
  bodyValues:  Record<string, { value: string }>;
  textBody:    Array<{ partId: string }>;
  htmlBody:    Array<{ partId: string }>;
  headers:     Array<{ name: string; value: string }>;
}

interface JmapSession {
  primaryAccounts: Record<string, string>;
  apiUrl: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class FastmailJmapClient {
  private readonly authHeader: string;

  constructor(
    private readonly username: string,
    token: string,
  ) {
    this.authHeader = `Bearer ${token}`;
  }

  // ── Session ────────────────────────────────────────────────────────────────

  async getSession(): Promise<{ accountId: string; apiUrl: string }> {
    const res = await fetch(JMAP_WELL_KNOWN, {
      headers: { Authorization: this.authHeader },
    });
    if (res.status === 401) {
      throw new JmapAuthError(this.username);
    }
    if (!res.ok) {
      throw new Error(`JMAP session failed for ${this.username}: ${res.status} ${res.statusText}`);
    }
    const session = (await res.json()) as JmapSession;
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    if (!accountId) {
      throw new Error(`No mail accountId in JMAP session for ${this.username}`);
    }
    return { accountId, apiUrl: session.apiUrl };
  }

  // ── Mailboxes ──────────────────────────────────────────────────────────────

  async getMailboxIds(
    accountId: string,
    apiUrl: string,
  ): Promise<{ inboxId: string; sentId: string }> {
    const res = await this.callMethod(apiUrl, [
      [
        'Mailbox/get',
        { accountId, ids: null },
        'mb',
      ],
    ]);

    const mailboxes = (res[0][1] as { list: Array<{ id: string; role: string | null }> }).list;
    const inbox = mailboxes.find((m) => m.role === 'inbox');
    const sent  = mailboxes.find((m) => m.role === 'sent');

    if (!inbox) throw new Error(`No inbox mailbox found for ${this.username}`);
    if (!sent)  throw new Error(`No sent mailbox found for ${this.username}`);

    return { inboxId: inbox.id, sentId: sent.id };
  }

  // ── Email query ────────────────────────────────────────────────────────────

  /**
   * Returns new email IDs since sinceQueryState (incremental) or the most
   * recent 50 emails (first run). Falls back to fresh query if Fastmail
   * returns cannotCalculateChanges (queryState too old / invalidated).
   */
  async queryEmailIds(
    accountId: string,
    apiUrl: string,
    mailboxId: string,
    sinceQueryState?: string,
  ): Promise<{ emailIds: string[]; newQueryState: string; didFallback: boolean }> {
    if (sinceQueryState) {
      try {
        return await this.queryChanges(accountId, apiUrl, mailboxId, sinceQueryState);
      } catch (err) {
        if (err instanceof JmapCannotCalculateChangesError) {
          // queryState expired — fall through to fresh query
        } else {
          throw err;
        }
      }
    }
    const result = await this.queryFresh(accountId, apiUrl, mailboxId);
    return { ...result, didFallback: true };
  }

  private async queryChanges(
    accountId: string,
    apiUrl: string,
    mailboxId: string,
    sinceQueryState: string,
  ): Promise<{ emailIds: string[]; newQueryState: string; didFallback: boolean }> {
    const res = await this.callMethod(apiUrl, [
      [
        'Email/queryChanges',
        {
          accountId,
          sinceQueryState,
          filter: { inMailbox: mailboxId },
          sort: [{ property: 'receivedAt', isAscending: false }],
        },
        'eq',
      ],
    ]);

    const result = res[0][1] as {
      newQueryState: string;
      added: Array<{ id: string }>;
      error?: { type: string };
    };

    if ('error' in result && result.error?.type === 'cannotCalculateChanges') {
      throw new JmapCannotCalculateChangesError();
    }

    const emailIds = (result.added ?? []).map((a) => a.id);
    return { emailIds, newQueryState: result.newQueryState, didFallback: false };
  }

  private async queryFresh(
    accountId: string,
    apiUrl: string,
    mailboxId: string,
  ): Promise<{ emailIds: string[]; newQueryState: string }> {
    const res = await this.callMethod(apiUrl, [
      [
        'Email/query',
        {
          accountId,
          filter: { inMailbox: mailboxId },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit: 50,
          position: 0,
        },
        'eq',
      ],
    ]);

    const result = res[0][1] as { queryState: string; ids: string[] };
    return { emailIds: result.ids, newQueryState: result.queryState };
  }

  // ── Email fetch ────────────────────────────────────────────────────────────

  async getEmails(
    accountId: string,
    apiUrl: string,
    emailIds: string[],
  ): Promise<JmapEmail[]> {
    if (emailIds.length === 0) return [];

    // Batch in groups of 50 to stay within JMAP method call limits
    const results: JmapEmail[] = [];
    for (let i = 0; i < emailIds.length; i += 50) {
      const batch = emailIds.slice(i, i + 50);
      const res = await this.callMethod(apiUrl, [
        [
          'Email/get',
          {
            accountId,
            ids: batch,
            properties: [
              'id', 'subject', 'from', 'to', 'cc',
              'receivedAt', 'bodyValues', 'textBody', 'htmlBody', 'headers',
            ],
            fetchAllBodyValues: true,
          },
          'eg',
        ],
      ]);
      const list = (res[0][1] as { list: JmapEmail[] }).list;
      results.push(...list);
    }
    return results;
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────

  private async callMethod(
    apiUrl: string,
    methodCalls: unknown[],
  ): Promise<Array<[string, unknown, string]>> {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
        methodCalls,
      }),
    });

    if (res.status === 401) {
      throw new JmapAuthError(this.username);
    }
    if (!res.ok) {
      throw new Error(`JMAP API error for ${this.username}: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { methodResponses: Array<[string, unknown, string]> };
    return data.methodResponses;
  }
}

// ── Error types ───────────────────────────────────────────────────────────────

export class JmapAuthError extends Error {
  constructor(username: string) {
    super(`JMAP auth failed for ${username}: 401 Unauthorized`);
    this.name = 'JmapAuthError';
  }
}

class JmapCannotCalculateChangesError extends Error {
  constructor() {
    super('cannotCalculateChanges');
  }
}

// ── Email body extraction ─────────────────────────────────────────────────────

/**
 * Returns the plain-text body of a JMAP email.
 * Prefers textBody; falls back to htmlBody with tags stripped.
 * Returns empty string if no body is available.
 */
export function extractBody(email: JmapEmail): string {
  // Try plain text first
  for (const part of email.textBody) {
    const val = email.bodyValues[part.partId]?.value;
    if (val && val.trim()) return val;
  }
  // Fall back to HTML with tags stripped
  for (const part of email.htmlBody) {
    const val = email.bodyValues[part.partId]?.value;
    if (val && val.trim()) return stripHtml(val);
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Email filtering ───────────────────────────────────────────────────────────

/**
 * Returns true if the email should be silently skipped.
 * Checks for spam scores, marketing/bulk headers, and auto-generated mail.
 */
export function shouldSkipEmail(headers: Array<{ name: string; value: string }>): boolean {
  const hdr = (name: string): string | undefined =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

  // Fastmail's own spam flags
  const spamStatus = hdr('X-Spam-Status');
  if (spamStatus && /^yes/i.test(spamStatus)) return true;

  const spamFlag = hdr('X-Spam-Flag');
  if (spamFlag && /^yes/i.test(spamFlag)) return true;

  // Numeric spam score
  const spamScore = hdr('X-Spam-Score');
  if (spamScore) {
    const score = parseFloat(spamScore);
    if (!isNaN(score) && score >= 5.0) return true;
  }

  // Bulk/list precedence
  const precedence = hdr('Precedence');
  if (precedence && /^(bulk|list|junk)$/i.test(precedence.trim())) return true;

  // Unsubscribe header → mailing list / marketing
  if (hdr('List-Unsubscribe')) return true;

  // Campaign tracking headers
  if (hdr('X-Campaign-Id')) return true;
  if (headers.some((h) => h.name.toLowerCase().startsWith('x-mailchimp-'))) return true;

  // Auto-generated system mail
  const autoSubmitted = hdr('Auto-Submitted');
  if (autoSubmitted && /auto-generated/i.test(autoSubmitted)) return true;

  return false;
}
