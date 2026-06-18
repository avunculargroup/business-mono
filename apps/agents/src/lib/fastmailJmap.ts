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

// Read paths use core + mail; sending additionally needs the submission spec.
const DEFAULT_USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];
const SUBMISSION_USING = [...DEFAULT_USING, 'urn:ietf:params:jmap:submission'];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JmapAddress {
  name?: string;
  email: string;
}

export interface JmapIdentity {
  id: string;
  email: string;
  name: string | null;
}

export interface JmapAttachment {
  partId?: string;
  blobId?: string;
  type?: string | null;        // MIME type, e.g. 'application/pdf'
  name?: string | null;        // filename
  size?: number;
  disposition?: string | null; // 'attachment' | 'inline' | null
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
  attachments?: JmapAttachment[];
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
    const res = await this.fetchWithRetry(JMAP_WELL_KNOWN, {
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

  /**
   * Resolves a user-created folder by its (leaf) name, case-insensitively.
   * Returns null when no such folder exists so the caller can warn and skip
   * rather than crash the whole poll — e.g. the research folder isn't set up yet.
   */
  async getMailboxIdByName(
    accountId: string,
    apiUrl: string,
    name: string,
  ): Promise<string | null> {
    const res = await this.callMethod(apiUrl, [
      ['Mailbox/get', { accountId, ids: null, properties: ['id', 'name', 'role'] }, 'mb'],
    ]);
    const mailboxes = (res[0][1] as { list: Array<{ id: string; name: string }> }).list;
    const target = name.trim().toLowerCase();
    const match = mailboxes.find((m) => m.name?.trim().toLowerCase() === target);
    return match ? match.id : null;
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
              // attachments metadata only (partId/type/name/size) — no blob
              // download; lets the research path flag PDFs and count attachments.
              'attachments',
            ],
            fetchAllBodyValues: true,
            // Cap each body value server-side so a multi-MB marketing/newsletter
            // email is never fetched (let alone regex-stripped) in full — the
            // memory-constrained agents host OOMs on chained .replace() passes
            // over a large body. 1 MB is far above any legitimate email body.
            maxBodyValueBytes: 1_048_576,
          },
          'eg',
        ],
      ]);
      const list = (res[0][1] as { list: JmapEmail[] }).list;
      results.push(...list);
    }
    return results;
  }

  // ── Sending (Email/set + EmailSubmission) ───────────────────────────────────

  /**
   * Lists the account's sending identities (id + from-address). The submission
   * spec is required in the `using` set. Used to resolve which identity to send
   * an outbound digest from.
   */
  async getIdentities(accountId: string, apiUrl: string): Promise<JmapIdentity[]> {
    const res = await this.callMethod(
      apiUrl,
      [['Identity/get', { accountId, ids: null }, 'i']],
      SUBMISSION_USING,
    );
    const list = (res[0][1] as { list?: Array<{ id: string; email: string; name?: string | null }> }).list ?? [];
    return list.map((i) => ({ id: i.id, email: i.email, name: i.name ?? null }));
  }

  /** Resolves the Drafts and Sent mailbox ids by role (needed to compose + file a sent message). */
  async getDraftsAndSentMailboxIds(
    accountId: string,
    apiUrl: string,
  ): Promise<{ draftsId: string; sentId: string }> {
    const res = await this.callMethod(apiUrl, [
      ['Mailbox/get', { accountId, ids: null, properties: ['id', 'role'] }, 'mb'],
    ]);
    const mailboxes = (res[0][1] as { list: Array<{ id: string; role: string | null }> }).list;
    const drafts = mailboxes.find((m) => m.role === 'drafts');
    const sent = mailboxes.find((m) => m.role === 'sent');
    if (!drafts) throw new Error(`No drafts mailbox found for ${this.username}`);
    if (!sent) throw new Error(`No sent mailbox found for ${this.username}`);
    return { draftsId: drafts.id, sentId: sent.id };
  }

  /**
   * Composes an HTML (+ plain-text) email and submits it for delivery in a single
   * JMAP request: Email/set creates the message as a draft, then EmailSubmission/set
   * sends it and — on success — moves it out of Drafts into Sent and clears $draft.
   * Throws if either the create or the submission is rejected.
   */
  async sendHtmlEmail(params: {
    accountId: string;
    apiUrl: string;
    identityId: string;
    draftsId: string;
    sentId: string;
    from: JmapAddress;
    to: JmapAddress[];
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const res = await this.callMethod(
      params.apiUrl,
      [
        [
          'Email/set',
          {
            accountId: params.accountId,
            create: {
              draft: {
                mailboxIds: { [params.draftsId]: true },
                keywords: { $draft: true, $seen: true },
                from: [params.from],
                to: params.to,
                subject: params.subject,
                bodyValues: {
                  text: { value: params.text },
                  html: { value: params.html },
                },
                textBody: [{ partId: 'text', type: 'text/plain' }],
                htmlBody: [{ partId: 'html', type: 'text/html' }],
              },
            },
          },
          '0',
        ],
        [
          'EmailSubmission/set',
          {
            accountId: params.accountId,
            // On a successful send, patch the email: replace its mailboxes with
            // Sent and drop the $draft flag so it doesn't linger in Drafts.
            onSuccessUpdateEmail: {
              '#sendIt': {
                mailboxIds: { [params.sentId]: true },
                'keywords/$draft': null,
              },
            },
            create: {
              sendIt: {
                emailId: '#draft',
                identityId: params.identityId,
                envelope: {
                  mailFrom: { email: params.from.email },
                  rcptTo: params.to.map((t) => ({ email: t.email })),
                },
              },
            },
          },
          '1',
        ],
      ],
      SUBMISSION_USING,
    );

    const emailSet = res[0][1] as {
      notCreated?: Record<string, { type: string; description?: string }>;
    };
    if (emailSet.notCreated?.draft) {
      const e = emailSet.notCreated.draft;
      throw new Error(`JMAP Email/set failed: ${e.type}${e.description ? ` — ${e.description}` : ''}`);
    }
    const subSet = res[1][1] as {
      notCreated?: Record<string, { type: string; description?: string }>;
    };
    if (subSet.notCreated?.sendIt) {
      const e = subSet.notCreated.sendIt;
      throw new Error(
        `JMAP EmailSubmission/set failed: ${e.type}${e.description ? ` — ${e.description}` : ''}`,
      );
    }
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────

  private async callMethod(
    apiUrl: string,
    methodCalls: unknown[],
    using: string[] = DEFAULT_USING,
  ): Promise<Array<[string, unknown, string]>> {
    const res = await this.fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        using,
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

  // fetch() throws TypeError for network-layer failures (DNS, connect timeout,
  // socket reset) — HTTP errors do not throw. Retry those transient cases;
  // surface anything else immediately.
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fetch(url, init);
      } catch (err) {
        lastErr = err;
        if (!(err instanceof TypeError) || attempt === maxAttempts) break;
        const backoffMs = 1000 * 2 ** (attempt - 1);
        console.warn(
          `[fastmail-jmap] fetch ${url} failed (attempt ${attempt}/${maxAttempts}), ` +
          `retrying in ${backoffMs}ms: ${err.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw lastErr;
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

// Hard ceiling on the input to the regex chain below. stripHtml runs ~10 chained
// global .replace() passes, each allocating a fresh full-size string; on the
// memory-constrained agents host (heap ~256 MB, near its ceiling at baseline) a
// multi-MB HTML email — marketing/newsletter mail routinely is — spikes enough
// transient garbage to OOM mid-replace (Runtime_RegExpReplaceRT). The JMAP
// maxBodyValueBytes request param is the first line of defence; this guards every
// caller too (ad-hoc/future callers, and bodies decoded past the octet cap). A
// real email body is tens of KB, so 1M chars is far above any legitimate one;
// truncating a pathological body mid-markup is fine for best-effort plain text.
const MAX_STRIP_HTML_CHARS = 1_000_000;

function stripHtml(rawHtml: string): string {
  const html =
    rawHtml.length > MAX_STRIP_HTML_CHARS ? rawHtml.slice(0, MAX_STRIP_HTML_CHARS) : rawHtml;
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

// ── Header / address helpers ────────────────────────────────────────────────

type Header = { name: string; value: string };

/** First header value matching `name` (case-insensitive), or undefined. */
export function findHeader(headers: Header[], name: string): string | undefined {
  const target = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === target)?.value;
}

/** The RFC 5322 Message-ID with surrounding angle brackets stripped, or null. */
export function getMessageId(email: JmapEmail): string | null {
  const raw = findHeader(email.headers, 'Message-ID') ?? findHeader(email.headers, 'Message-Id');
  if (!raw) return null;
  return raw.trim().replace(/^<|>$/g, '') || null;
}

/**
 * Parses the SPF/DKIM/DMARC verdicts out of any Authentication-Results headers.
 * Returns the first non-null verdict found per method, lowercased
 * (e.g. 'pass', 'fail', 'softfail', 'none'). Missing methods are null.
 */
export function parseAuthResults(
  headers: Header[],
): { spf: string | null; dkim: string | null; dmarc: string | null } {
  const result: { spf: string | null; dkim: string | null; dmarc: string | null } = {
    spf: null,
    dkim: null,
    dmarc: null,
  };
  const verdict = (value: string, method: string): string | null => {
    // matches e.g. "spf=pass" / "dkim = fail" — token after '=' up to space/semicolon
    const m = value.match(new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, 'i'));
    return m ? m[1].toLowerCase() : null;
  };
  for (const h of headers) {
    if (h.name.toLowerCase() !== 'authentication-results') continue;
    result.spf ??= verdict(h.value, 'spf');
    result.dkim ??= verdict(h.value, 'dkim');
    result.dmarc ??= verdict(h.value, 'dmarc');
  }
  return result;
}

/** True when SPF or DKIM explicitly failed — the reject condition for research mail. */
export function isAuthFail(headers: Header[]): boolean {
  const { spf, dkim } = parseAuthResults(headers);
  return spf === 'fail' || dkim === 'fail';
}

/** The plus-address tag of a single address (`research+gromen@x` → `gromen`), or null. */
export function parsePlusTag(address: string): string | null {
  const local = address.trim().toLowerCase().split('@')[0];
  if (!local) return null;
  const plus = local.indexOf('+');
  if (plus === -1) return null;
  const tag = local.slice(plus + 1);
  return tag || null;
}

/**
 * Finds the research source slug from a delivered email by scanning To + Cc for
 * a plus-addressed recipient. Returns the first plus-tag found, or null.
 */
export function extractResearchSlug(email: JmapEmail): string | null {
  const recipients = [...(email.to ?? []), ...(email.cc ?? [])];
  for (const r of recipients) {
    const tag = parsePlusTag(r.email);
    if (tag) return tag;
  }
  return null;
}

/** Count of real attachments (disposition 'attachment', or any named part). */
export function attachmentCount(email: JmapEmail): number {
  return (email.attachments ?? []).filter(
    (a) => a.disposition === 'attachment' || (a.name != null && a.name !== ''),
  ).length;
}

/** True when any attachment is a PDF (by MIME type or .pdf filename). */
export function hasPdfAttachment(email: JmapEmail): boolean {
  return (email.attachments ?? []).some(
    (a) =>
      (a.type ?? '').toLowerCase() === 'application/pdf' ||
      (a.name ?? '').toLowerCase().endsWith('.pdf'),
  );
}

// ── Email filtering ───────────────────────────────────────────────────────────

/**
 * Returns true if the email should be silently skipped.
 * Checks for spam scores, marketing/bulk headers, and auto-generated mail.
 *
 * NOTE: this is the CRM-sync filter. It deliberately skips bulk/list mail
 * (List-Unsubscribe, Precedence: bulk, campaign headers) — which is exactly
 * what newsletters are — so the research-folder listener must NOT apply it.
 */
export function shouldSkipEmail(headers: Array<{ name: string; value: string }>): boolean {
  const hdr = (name: string): string | undefined => findHeader(headers, name);

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
