/**
 * Emails ONE founder their drafted social posts for review. Narrows the
 * news-digest delivery to a single recipient (the founder) and renders the
 * platform-mimic draft email instead of the digest.
 *
 * Reuses the same sender plumbing as the news digest: the avuncular@fastmail.com
 * login's stored token (no separate secret), sending as the hq@btreasury.com.au
 * identity. Best-effort — returns false (and logs) on any failure so emailing can
 * never sink the routine.
 *
 * Env:
 *   WEB_APP_URL   Absolute base for the per-draft "Review" links (button omitted if unset)
 */

import { supabase } from '@platform/db';
import { FastmailJmapClient, type JmapAddress } from './fastmailJmap.js';
import { renderSocialDraftEmail, type SocialDraftPost } from './socialDraftEmail.js';
import {
  SENDER_ACCOUNT_USERNAME,
  SENDER_FROM_EMAIL,
  SENDER_FROM_NAME,
  loadSenderToken,
  loadCompanyFooter,
} from './sendNewsDigest.js';
import { createLogger } from './logger.js';

const log = createLogger('social-draft');

export type { SocialDraftPost } from './socialDraftEmail.js';

export interface SendSocialDraftParams {
  founderTeamMemberId: string;
  founderName: string;
  story: { id: string; title: string; url: string; source_name: string };
  posts: SocialDraftPost[];
}

/** Resolve the founder's account email (team_members.id === auth.users.id). */
async function loadFounderRecipient(founderTeamMemberId: string, founderName: string): Promise<JmapAddress | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Failed to list auth users: ${error.message}`);
  const user = data.users.find((u) => u.id === founderTeamMemberId && u.email);
  if (!user?.email) return null;
  return { name: founderName, email: user.email };
}

async function logFailure(founderTeamMemberId: string, message: string): Promise<void> {
  try {
    await supabase.from('agent_activity').insert({
      agent_name: 'charlie',
      action: `Social draft email failed: ${message}`,
      status: 'error',
      trigger_type: 'scheduled',
      entity_type: 'team_member',
      entity_id: founderTeamMemberId,
    } as never);
  } catch {
    // Never let audit logging mask the original failure.
  }
}

/** Returns true when the founder draft email was sent. Never throws. */
export async function sendSocialDraft(params: SendSocialDraftParams): Promise<boolean> {
  const { founderTeamMemberId, founderName, story, posts } = params;
  if (posts.length === 0) return false;

  const token = await loadSenderToken();
  if (!token) {
    log.warn({ account: SENDER_ACCOUNT_USERNAME }, 'no Fastmail token — skipping email');
    return false;
  }

  try {
    const [recipient, company] = await Promise.all([
      loadFounderRecipient(founderTeamMemberId, founderName),
      loadCompanyFooter(),
    ]);
    if (!recipient) {
      log.warn({ founderName }, 'no account email for founder — skipping email');
      return false;
    }

    const { subject, html, text } = renderSocialDraftEmail({
      founderName,
      story,
      posts,
      webAppUrl: process.env['WEB_APP_URL'],
      company,
    });

    const client = new FastmailJmapClient(SENDER_ACCOUNT_USERNAME, token);
    const { accountId, apiUrl } = await client.getSession();
    const identities = await client.getIdentities(accountId, apiUrl);
    const identity =
      identities.find((i) => i.email.toLowerCase() === SENDER_FROM_EMAIL.toLowerCase()) ?? identities[0];
    if (!identity) throw new Error(`No JMAP identity to send from on ${SENDER_ACCOUNT_USERNAME}`);
    const { draftsId, sentId } = await client.getDraftsAndSentMailboxIds(accountId, apiUrl);

    await client.sendHtmlEmail({
      accountId,
      apiUrl,
      identityId: identity.id,
      draftsId,
      sentId,
      from: { name: SENDER_FROM_NAME, email: identity.email },
      to: [recipient],
      subject,
      html,
      text,
    });
    log.info({ subject, recipient: recipient.email }, 'sent');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ error: message }, 'delivery aborted');
    await logFailure(founderTeamMemberId, message);
    return false;
  }
}
