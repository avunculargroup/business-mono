/**
 * Delivers a news_curation routine result to the team by email.
 *
 * Recipients are every team_member with an account email (resolved from
 * auth.users). The message is sent from the avuncular@fastmail.com Fastmail
 * login, reusing the app-password already stored in `fastmail_accounts` (no
 * separate secret), as the hq@btreasury.com.au send identity that account owns.
 * Sending is independent of the inbound CRM poll — it never creates interactions.
 *
 * This is best-effort: when the sender token is missing, or an individual send
 * fails, it logs and continues. It never throws, so emailing can never fail the
 * routine itself (per the "auto-send, log failures, routine still succeeds"
 * decision).
 *
 * Env:
 *   WEB_APP_URL   Absolute base for the "More news" link (optional; button omitted if unset)
 */

import { supabase } from '@platform/db';
import type { RoutineResult } from '@platform/shared';
import { FastmailJmapClient, type JmapAddress } from './fastmailJmap.js';
import { renderNewsDigestEmail, type CompanyFooter } from './newsDigestEmail.js';
import { createLogger } from './logger.js';

const teamEmailLog = createLogger('team-email');
const digestLog = createLogger('news-digest');

// The Fastmail login whose stored token sends the digest, and the send-identity
// (an alias on that account) the message is From. Both live on the same account
// already managed in fastmail_accounts, so no extra credential is needed.
export const SENDER_ACCOUNT_USERNAME = 'avuncular@fastmail.com';
export const SENDER_FROM_EMAIL = 'hq@btreasury.com.au';
// Display name on every outbound email from the agent server.
export const SENDER_FROM_NAME = 'BTS HQ';

export interface DigestDeliveryResult {
  /** False when no sender token is available in fastmail_accounts — nothing was attempted. */
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
}

export interface DigestRoutineRef {
  id: string;
  /** Header eyebrow text — the routine's dashboard title or name. */
  title: string;
}

/** A fully-rendered message, ready to send to every team member. */
export interface TeamEmailMessage {
  subject: string;
  html: string;
  text: string;
}

/** Renders the message for one recipient — lets a caller personalise per address (e.g. a greeting). */
export type TeamEmailMessageFactory = (recipient: JmapAddress) => TeamEmailMessage;

/**
 * Sends a pre-rendered message to every team member from the hq@ send identity,
 * reusing the Fastmail token already stored in fastmail_accounts. Best-effort:
 * returns configured:false when no token exists, counts and logs per-recipient
 * failures, and never throws — so email delivery can never fail the calling
 * routine. The transport shared by every team-wide email (news digest, market
 * report, …); callers own the rendering. Pass a factory instead of a static
 * message to personalise per recipient (e.g. a first-name greeting).
 */
export async function deliverTeamEmail(
  routine: DigestRoutineRef,
  message: TeamEmailMessage | TeamEmailMessageFactory,
): Promise<DigestDeliveryResult> {
  const token = await loadSenderToken();
  if (!token) {
    teamEmailLog.warn(
      { account: SENDER_ACCOUNT_USERNAME },
      'no Fastmail token in fastmail_accounts — skipping email delivery',
    );
    return { configured: false, attempted: 0, sent: 0, failed: 0 };
  }

  try {
    const recipients = await loadRecipients();
    if (recipients.length === 0) {
      teamEmailLog.warn('no team_member recipients with an email — skipping');
      return { configured: true, attempted: 0, sent: 0, failed: 0 };
    }

    const client = new FastmailJmapClient(SENDER_ACCOUNT_USERNAME, token);
    const { accountId, apiUrl } = await client.getSession();
    const identities = await client.getIdentities(accountId, apiUrl);
    const identity =
      identities.find((i) => i.email.toLowerCase() === SENDER_FROM_EMAIL.toLowerCase()) ??
      identities[0];
    if (!identity) {
      throw new Error(`No JMAP identity available to send from on ${SENDER_ACCOUNT_USERNAME}`);
    }
    const { draftsId, sentId } = await client.getDraftsAndSentMailboxIds(accountId, apiUrl);

    const from: JmapAddress = { name: SENDER_FROM_NAME, email: identity.email };

    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      try {
        const { subject, html, text } = typeof message === 'function' ? message(to) : message;
        await client.sendHtmlEmail({
          accountId,
          apiUrl,
          identityId: identity.id,
          draftsId,
          sentId,
          from,
          to: [to],
          subject,
          html,
          text,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        const errMessage = err instanceof Error ? err.message : String(err);
        teamEmailLog.error({ recipient: to.email, error: errMessage }, 'failed to send');
        await logSendFailure(routine, to.email, errMessage);
      }
    }

    teamEmailLog.info({ title: routine.title, sent, failed }, 'digest sent');
    return { configured: true, attempted: recipients.length, sent, failed };
  } catch (err) {
    // A setup failure (auth, session, recipient lookup) must not fail the routine.
    const errMessage = err instanceof Error ? err.message : String(err);
    teamEmailLog.error({ error: errMessage }, 'delivery aborted');
    await logSendFailure(routine, null, errMessage);
    return { configured: true, attempted: 0, sent: 0, failed: 0 };
  }
}

/** Renders a news_curation result and delivers it to the team (thin wrapper over
 *  the shared transport — the rendering is the only news-specific part). */
export async function deliverNewsDigest(
  routine: DigestRoutineRef,
  result: RoutineResult,
): Promise<DigestDeliveryResult> {
  const company = await loadCompanyFooter();
  const date = new Date();
  const webAppUrl = process.env['WEB_APP_URL'];
  // Render per recipient so each email opens with their own first-name greeting.
  return deliverTeamEmail(routine, (recipient) =>
    renderNewsDigestEmail({
      title: routine.title,
      greeting: digestGreeting(recipient),
      result,
      date,
      webAppUrl,
      company,
    }),
  );
}

/** "Morning Chris," from a recipient's name, or a plain "Morning," when no name is known. */
export function digestGreeting(recipient: JmapAddress): string {
  const first = recipient.name?.trim().split(/\s+/)[0] ?? '';
  return first ? `Morning ${first},` : 'Morning,';
}

/** The app-specific password for the sending account, from fastmail_accounts. */
export async function loadSenderToken(): Promise<string | null> {
  const { data, error } = await supabase
    .from('fastmail_accounts')
    .select('token')
    .eq('username', SENDER_ACCOUNT_USERNAME)
    .maybeSingle();
  if (error) {
    digestLog.error({ error: error.message }, 'failed to load sender token');
    return null;
  }
  const token = (data as { token?: string } | null)?.token;
  return token ?? null;
}

/** Team members with a usable account email, as JMAP addresses. */
async function loadRecipients(): Promise<JmapAddress[]> {
  const { data: members, error } = await supabase.from('team_members').select('id, full_name');
  if (error) throw new Error(`Failed to load team_members: ${error.message}`);
  const nameById = new Map<string, string>();
  for (const m of members ?? []) nameById.set(m.id as string, (m.full_name as string) ?? '');

  const { data: list, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(`Failed to list auth users: ${usersError.message}`);

  const recipients: JmapAddress[] = [];
  for (const u of list.users) {
    if (!u.email || !nameById.has(u.id)) continue;
    const name = nameById.get(u.id);
    recipients.push(name ? { name, email: u.email } : { email: u.email });
  }
  return recipients;
}

/** Footer details, sourced from company_records (same keys the newsletter uses). */
export async function loadCompanyFooter(): Promise<CompanyFooter> {
  const { data } = await supabase.from('company_records').select('type_key, value');
  const vars: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ type_key: string; value: string | null }>) {
    if (row.value) vars[row.type_key] = row.value;
  }
  return {
    name: vars['trading_name'] || vars['legal_name'] || 'Bitcoin Treasury Solutions',
    website: vars['website'],
    abn: vars['abn'],
  };
}

async function logSendFailure(
  routine: DigestRoutineRef,
  recipient: string | null,
  message: string,
): Promise<void> {
  try {
    await supabase.from('agent_activity').insert({
      agent_name: 'rex',
      action: `Team email failed${recipient ? ` for ${recipient}` : ''}: ${routine.title}`,
      status: 'error',
      trigger_type: 'scheduled',
      entity_type: 'routine',
      entity_id: routine.id,
      notes: message.slice(0, 500),
    });
  } catch (err) {
    digestLog.error({ err }, 'failed to log send failure');
  }
}
