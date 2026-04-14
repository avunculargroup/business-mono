/**
 * Fastmail email polling listener
 *
 * Polls all active Fastmail accounts every 5 minutes via JMAP, logs new
 * emails as interactions, matches or creates CRM contacts, and dispatches
 * to Della for content analysis.
 *
 * Accounts and exclusion rules are read from the DB on every poll cycle —
 * changes take effect within ≤5 minutes without redeployment.
 */

import { supabase } from '@platform/db';
import {
  FastmailJmapClient,
  shouldSkipEmail,
  extractBody,
} from '../lib/fastmailJmap.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Entry point ───────────────────────────────────────────────────────────────

export function startFastmailListener(): void {
  console.log('[fastmail-listener] Starting Fastmail polling (5-minute interval)');
  void pollAllAccounts();
  setInterval(() => void pollAllAccounts(), POLL_INTERVAL_MS);
}

// ── Poll all accounts ─────────────────────────────────────────────────────────

async function pollAllAccounts(): Promise<void> {
  let accounts: Array<{ id: string; username: string; token: string; display_name: string | null; watched_addresses: string[] }>;
  let exclusions: Array<{ type: string; value: string }>;
  let teamEmails: Set<string>;

  try {
    const [allAccountsRes, exclusionsRes] = await Promise.all([
      // Fetch all accounts (active + inactive) so we can build the full team
      // email set for internal/external classification, then filter to active
      // for polling.
      supabase.from('fastmail_accounts').select('id, username, token, display_name, watched_addresses, is_active'),
      supabase.from('fastmail_exclusions').select('type, value'),
    ]);

    if (allAccountsRes.error) throw allAccountsRes.error;
    if (exclusionsRes.error) throw exclusionsRes.error;

    const allAccounts = allAccountsRes.data ?? [];
    accounts = allAccounts.filter((a) => a.is_active);
    exclusions = exclusionsRes.data ?? [];

    // Derive team email addresses from all Fastmail accounts (active + inactive).
    // All accounts in this table belong to team members, so their addresses
    // (username + any watched aliases) count as internal addresses.
    teamEmails = new Set(
      allAccounts.flatMap((a) => [
        a.username.toLowerCase(),
        ...a.watched_addresses.map((addr) => addr.toLowerCase()),
      ]),
    );
  } catch (err) {
    console.error('[fastmail-listener] Failed to load config from DB:', err);
    return;
  }

  if (accounts.length === 0) {
    console.log('[fastmail-listener] No active Fastmail accounts — skipping poll cycle');
    return;
  }

  // Process accounts sequentially to avoid rate-limit issues
  for (const account of accounts) {
    try {
      await pollAccount(account, exclusions, teamEmails);
    } catch (err) {
      console.error(`[fastmail-listener] Error polling account ${account.username}:`, err);
    }
  }
}

// ── Poll a single account ─────────────────────────────────────────────────────

async function pollAccount(
  account: { id: string; username: string; token: string; display_name: string | null; watched_addresses: string[] },
  exclusions: Array<{ type: string; value: string }>,
  teamEmails: Set<string>,
): Promise<void> {
  const client = new FastmailJmapClient(account.username, account.token);

  const { accountId, apiUrl } = await client.getSession();
  const { inboxId, sentId } = await client.getMailboxIds(accountId, apiUrl);

  const watchedAddresses: Set<string> = new Set(
    account.watched_addresses.map((a) => a.toLowerCase()),
  );

  // Load or create sync state row for this account
  const { data: syncRow } = await supabase
    .from('fastmail_sync_state')
    .select('inbox_query_state, sent_query_state')
    .eq('account_id', account.id)
    .single();

  const inboxQueryState = syncRow?.inbox_query_state ?? undefined;
  const sentQueryState  = syncRow?.sent_query_state  ?? undefined;

  // ── Inbox ─────────────────────────────────────────────────────────────────

  const inboxResult = await client.queryEmailIds(accountId, apiUrl, inboxId, inboxQueryState);
  if (inboxResult.emailIds.length > 0) {
    const emails = await client.getEmails(accountId, apiUrl, inboxResult.emailIds);
    for (const email of emails) {
      try {
        await processEmail(email, 'inbox', account.username, exclusions, teamEmails, watchedAddresses);
      } catch (err) {
        console.error(
          `[fastmail-listener] Error processing inbox email ${email.id} for ${account.username}:`,
          err,
        );
      }
    }
  }

  // ── Sent ──────────────────────────────────────────────────────────────────
  // Only process Sent emails that have at least one external recipient.
  // This prevents logging internal emails twice (they're already captured
  // from the recipient's Inbox above).

  const sentResult = await client.queryEmailIds(accountId, apiUrl, sentId, sentQueryState);
  if (sentResult.emailIds.length > 0) {
    const emails = await client.getEmails(accountId, apiUrl, sentResult.emailIds);
    for (const email of emails) {
      const allRecipients = [
        ...(email.to ?? []),
        ...(email.cc ?? []),
      ].map((a) => a.email.toLowerCase());

      const hasExternalRecipient = allRecipients.some((e) => !teamEmails.has(e));
      if (!hasExternalRecipient) continue; // All recipients are team members — skip

      try {
        await processEmail(email, 'sent', account.username, exclusions, teamEmails, watchedAddresses);
      } catch (err) {
        console.error(
          `[fastmail-listener] Error processing sent email ${email.id} for ${account.username}:`,
          err,
        );
      }
    }
  }

  // ── Persist updated sync state ────────────────────────────────────────────

  await supabase.from('fastmail_sync_state').upsert(
    {
      account_id:        account.id,
      jmap_account_id:   accountId,
      inbox_query_state: inboxResult.newQueryState,
      sent_query_state:  sentResult.newQueryState,
      last_synced_at:    new Date().toISOString(),
    },
    { onConflict: 'account_id' },
  );

  console.log(
    `[fastmail-listener] Polled ${account.username}: ` +
    `${inboxResult.emailIds.length} inbox, ${sentResult.emailIds.length} sent emails checked`,
  );
}

// ── Process a single email ────────────────────────────────────────────────────

async function processEmail(
  email: Awaited<ReturnType<FastmailJmapClient['getEmails']>>[number],
  folder: 'inbox' | 'sent',
  _accountUsername: string,
  exclusions: Array<{ type: string; value: string }>,
  teamEmails: Set<string>,
  watchedAddresses: Set<string>,
): Promise<void> {
  // 1. Marketing / spam header check
  if (shouldSkipEmail(email.headers)) return;

  const fromEmail  = email.from?.[0]?.email?.toLowerCase() ?? '';
  const toEmails   = [...(email.to ?? []), ...(email.cc ?? [])].map((a) => a.email.toLowerCase());
  const allParticipants = [fromEmail, ...toEmails].filter(Boolean);

  // 2. Watched-address filter — skip if no participant matches a watched address
  if (watchedAddresses.size > 0 && !allParticipants.some((e) => watchedAddresses.has(e))) return;

  // 3. Exclusion list check (domain and exact email)
  for (const participant of allParticipants) {
    if (isExcluded(participant, exclusions)) return;
  }

  // 4. Determine direction and contact
  const isInternal = allParticipants.every((e) => teamEmails.has(e));
  let direction: 'inbound' | 'outbound' | 'internal';
  let contactId: string | null = null;
  let isNewContact = false;

  if (isInternal) {
    direction = 'internal';
  } else if (folder === 'inbox') {
    direction = 'inbound';
    // External sender
    const externalEmail = allParticipants.find((e) => !teamEmails.has(e)) ?? fromEmail;
    if (externalEmail) {
      const result = await findOrCreateContact(externalEmail, email.from?.[0]?.name);
      contactId     = result.contactId;
      isNewContact  = result.isNew;
    }
  } else {
    direction = 'outbound';
    // First external recipient
    const externalEmail = toEmails.find((e) => !teamEmails.has(e));
    if (externalEmail) {
      const name = email.to?.find((a) => a.email.toLowerCase() === externalEmail)?.name;
      const result = await findOrCreateContact(externalEmail, name);
      contactId    = result.contactId;
      isNewContact = result.isNew;
    }
  }

  // 5. Extract body text
  const bodyText = extractBody(email);
  const subject  = email.subject ?? '(no subject)';

  // 6. Insert interaction
  const { data: interaction, error: interactionError } = await supabase
    .from('interactions')
    .insert({
      contact_id:   contactId,
      type:         'email',
      direction,
      occurred_at:  email.receivedAt,
      raw_content:  bodyText || null,
      summary:      subject,
      source:       'fastmail_sync',
      participants: allParticipants,
    })
    .select('id')
    .single();

  if (interactionError) {
    throw new Error(`Failed to insert interaction: ${interactionError.message}`);
  }

  const interactionId = (interaction as { id: string }).id;

  // 7. Dispatch to Della for content analysis
  const contactLine = contactId
    ? `Contact: ${contactId}${isNewContact ? ' (NEW — needs review, confirm genuine lead or remove)' : ''}`
    : 'Internal team email — no contact linked';

  const dellaMessage =
    `Email logged (interaction ${interactionId}).\n` +
    `From: ${fromEmail}\n` +
    `To: ${toEmails.join(', ')}\n` +
    `Subject: ${subject}\n` +
    `Direction: ${direction}\n` +
    `${contactLine}\n\n` +
    `Analyse this email. Populate extracted_data on the interaction with ` +
    `action_items, decisions, commitments, bitcoin_signals, and sentiment.\n` +
    `Update contact notes if you learn anything relevant about them.\n` +
    (isNewContact
      ? `This is a NEW contact auto-created from email. Assess whether the sender looks like a genuine lead or should be removed.`
      : '') +
    (isInternal
      ? `This is an internal team email. Focus on tasks, decisions, and commitments between team members.`
      : '');

  await supabase.from('agent_activity').insert({
    agent_name:       'della',
    action:           'Fastmail email logged — dispatching for content analysis',
    status:           'pending',
    trigger_type:     'system',
    workflow_run_id:  null,
    entity_type:      'interaction',
    entity_id:        interactionId,
    proposed_actions: [{ agent: 'della', message: dellaMessage }],
    approved_actions: null,
    clarifications:   null,
    notes:            null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExcluded(
  emailAddress: string,
  exclusions: Array<{ type: string; value: string }>,
): boolean {
  const domain = emailAddress.split('@')[1] ?? '';
  for (const rule of exclusions) {
    if (rule.type === 'email'  && rule.value.toLowerCase() === emailAddress) return true;
    if (rule.type === 'domain' && rule.value.toLowerCase() === domain)       return true;
  }
  return false;
}

async function findOrCreateContact(
  emailAddress: string,
  displayName?: string,
): Promise<{ contactId: string; isNew: boolean }> {
  const normalised = emailAddress.toLowerCase();

  // Look up by normalised email
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', normalised)
    .single();

  if (existing) {
    return { contactId: (existing as { id: string }).id, isNew: false };
  }

  // Parse display name into first / last
  const { firstName, lastName } = parseDisplayName(displayName);

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      email:          normalised,
      first_name:     firstName,
      last_name:      lastName,
      pipeline_stage: 'lead',
      source:         'fastmail_sync',
      tags:           ['needs-review'],
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create contact for ${normalised}: ${error.message}`);

  console.log(`[fastmail-listener] Created new contact ${normalised} (${firstName} ${lastName})`);
  return { contactId: (created as { id: string }).id, isNew: true };
}

function parseDisplayName(name?: string): { firstName: string; lastName: string } {
  if (!name || !name.trim()) return { firstName: '', lastName: '' };
  const trimmed = name.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName:  trimmed.slice(spaceIdx + 1),
  };
}
