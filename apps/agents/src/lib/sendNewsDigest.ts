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

// The Fastmail login whose stored token sends the digest, and the send-identity
// (an alias on that account) the message is From. Both live on the same account
// already managed in fastmail_accounts, so no extra credential is needed.
export const SENDER_ACCOUNT_USERNAME = 'avuncular@fastmail.com';
export const SENDER_FROM_EMAIL = 'hq@btreasury.com.au';

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

export async function deliverNewsDigest(
  routine: DigestRoutineRef,
  result: RoutineResult,
): Promise<DigestDeliveryResult> {
  const token = await loadSenderToken();
  if (!token) {
    console.warn(
      `[news-digest] No Fastmail token for ${SENDER_ACCOUNT_USERNAME} in fastmail_accounts — skipping email delivery`,
    );
    return { configured: false, attempted: 0, sent: 0, failed: 0 };
  }

  try {
    const [recipients, company] = await Promise.all([loadRecipients(), loadCompanyFooter()]);
    if (recipients.length === 0) {
      console.warn('[news-digest] No team_member recipients with an email — skipping');
      return { configured: true, attempted: 0, sent: 0, failed: 0 };
    }

    const { subject, html, text } = renderNewsDigestEmail({
      title: routine.title,
      result,
      date: new Date(),
      webAppUrl: process.env['WEB_APP_URL'],
      company,
    });

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

    const from: JmapAddress = { name: company.name, email: identity.email };

    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      try {
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
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[news-digest] Failed to send to ${to.email}:`, message);
        await logSendFailure(routine, to.email, message);
      }
    }

    console.log(`[news-digest] Sent "${subject}" — ${sent} delivered, ${failed} failed`);
    return { configured: true, attempted: recipients.length, sent, failed };
  } catch (err) {
    // A setup failure (auth, session, recipient lookup) must not fail the routine.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[news-digest] Delivery aborted:', message);
    await logSendFailure(routine, null, message);
    return { configured: true, attempted: 0, sent: 0, failed: 0 };
  }
}

/** The app-specific password for the sending account, from fastmail_accounts. */
export async function loadSenderToken(): Promise<string | null> {
  const { data, error } = await supabase
    .from('fastmail_accounts')
    .select('token')
    .eq('username', SENDER_ACCOUNT_USERNAME)
    .maybeSingle();
  if (error) {
    console.error('[news-digest] Failed to load sender token:', error.message);
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
      action: `News digest email failed${recipient ? ` for ${recipient}` : ''}: ${routine.title}`,
      status: 'error',
      trigger_type: 'scheduled',
      entity_type: 'routine',
      entity_id: routine.id,
      notes: message.slice(0, 500),
    });
  } catch (err) {
    console.error('[news-digest] Failed to log send failure:', err);
  }
}
