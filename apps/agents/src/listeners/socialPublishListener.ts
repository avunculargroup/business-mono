/**
 * Scheduled social publishing poller.
 *
 * Every 60s, scans content_items for due LinkedIn posts
 * (status='scheduled', scheduled_for <= now) and publishes them via the
 * LinkedIn Posts API using the account's stored credential. Publishing is
 * gated on human approval + compliance clearance — this poller never
 * publishes anything a human hasn't approved.
 *
 * Double-post protection: each item is claimed with a conditional UPDATE
 * flipping publish_locked_at from NULL before any API call; a row that
 * can't be claimed was taken by an overlapping tick.
 *
 * Spec: docs/features/linkedin-posting/feature-spec.md
 */

import { supabase } from '@platform/db';
import {
  createLinkedInPost,
  linkedInPostUrl,
  LinkedInAuthError,
} from '../lib/linkedin.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('social-publish');

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_PUBLISH_ATTEMPTS = 3;
const CREDENTIAL_FAILURE_THRESHOLD = 3;
const EXPIRY_WARNING_DAYS = 14;
const EXPIRY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ERROR_MESSAGE_MAX_LEN = 500;

type DueItem = {
  id: string;
  title: string | null;
  body: string | null;
  approved_by: string | null;
  compliance_status: string | null;
  is_thread: boolean;
  publish_attempts: number;
  publish_error: string | null;
  social_account_id: string | null;
};

type Credential = {
  social_account_id: string;
  access_token: string;
  author_urn: string;
  expires_at: string;
  consecutive_failures: number;
};

let lastExpiryCheckAt = 0;

// ── Entry point ───────────────────────────────────────────────────────────────

export function startSocialPublishListener(): void {
  log.info('starting social publish polling (60s interval)');
  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
}

async function tick(): Promise<void> {
  try {
    await runPublishTick();
  } catch (err) {
    log.error({ err }, 'publish tick failed');
  }
  if (Date.now() - lastExpiryCheckAt >= EXPIRY_CHECK_INTERVAL_MS) {
    lastExpiryCheckAt = Date.now();
    try {
      await checkTokenExpiryWarnings();
    } catch (err) {
      log.error({ err }, 'token expiry check failed');
    }
  }
}

// ── Publish tick ──────────────────────────────────────────────────────────────

export async function runPublishTick(): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('content_items')
    .select(
      'id, title, body, approved_by, compliance_status, is_thread, publish_attempts, publish_error, social_account_id',
    )
    .eq('type', 'linkedin')
    .eq('status', 'scheduled')
    .is('publish_locked_at', null)
    .lte('scheduled_for', nowIso);

  if (error) throw error;
  const items = (due ?? []) as DueItem[];
  if (items.length === 0) return;

  const accountIds = [...new Set(items.map((i) => i.social_account_id).filter(Boolean))] as string[];

  const [specRes, accountsRes, credentialsRes] = await Promise.all([
    supabase.from('platform_specs').select('max_chars').eq('platform', 'linkedin').maybeSingle(),
    supabase.from('social_accounts').select('id, display_name, is_active').in('id', accountIds),
    supabase
      .from('social_credentials')
      .select('social_account_id, access_token, author_urn, expires_at, consecutive_failures')
      .in('social_account_id', accountIds),
  ]);

  const maxChars = (specRes.data as { max_chars: number } | null)?.max_chars ?? null;
  const accounts = new Map(
    ((accountsRes.data ?? []) as Array<{ id: string; display_name: string; is_active: boolean }>).map(
      (a) => [a.id, a],
    ),
  );
  const credentials = new Map(
    ((credentialsRes.data ?? []) as Credential[]).map((c) => [c.social_account_id, c]),
  );

  for (const item of items) {
    const guardError = guardErrorFor(item, accounts, credentials, maxChars);
    if (guardError !== null) {
      if (guardError !== item.publish_error) {
        await supabase
          .from('content_items')
          .update({ publish_error: guardError })
          .eq('id', item.id);
        log.info({ contentItemId: item.id, guardError }, 'due item held by guard');
      }
      continue;
    }
    if (item.publish_attempts >= MAX_PUBLISH_ATTEMPTS) continue; // error already recorded

    await publishItem(item, credentials.get(item.social_account_id as string) as Credential);
  }
}

/**
 * Returns a human-readable reason the item must not be published, or null
 * when every gate passes. Exported for tests.
 */
export function guardErrorFor(
  item: DueItem,
  accounts: Map<string, { id: string; display_name: string; is_active: boolean }>,
  credentials: Map<string, Credential>,
  maxChars: number | null,
): string | null {
  if (!item.social_account_id) return 'No social account linked';
  const account = accounts.get(item.social_account_id);
  if (!account || !account.is_active) return 'Social account is inactive';
  if (!item.approved_by) return 'Not approved — a human must approve before publishing';
  if (item.compliance_status !== 'cleared' && item.compliance_status !== 'overridden') {
    return 'Compliance review not cleared';
  }
  if (item.is_thread) return 'Threads are not supported on LinkedIn';
  const credential = credentials.get(item.social_account_id);
  if (!credential) return 'LinkedIn account not connected — connect it in Settings';
  if (credential.consecutive_failures >= CREDENTIAL_FAILURE_THRESHOLD) {
    return 'LinkedIn connection is failing — reconnect it in Settings';
  }
  if (new Date(credential.expires_at).getTime() <= Date.now()) {
    return 'LinkedIn token has expired — reconnect it in Settings';
  }
  if (!item.body || item.body.trim() === '') return 'Post body is empty';
  if (maxChars !== null && item.body.length > maxChars) {
    return `Post is ${item.body.length} characters — LinkedIn allows ${maxChars}`;
  }
  return null;
}

async function publishItem(item: DueItem, credential: Credential): Promise<void> {
  // Atomic claim — only one tick can flip publish_locked_at from NULL.
  const { data: claimed, error: claimError } = await supabase
    .from('content_items')
    .update({ publish_locked_at: new Date().toISOString() })
    .eq('id', item.id)
    .eq('status', 'scheduled')
    .is('publish_locked_at', null)
    .select('id');

  if (claimError) throw claimError;
  if (!claimed || claimed.length !== 1) return; // claimed by an overlapping tick

  try {
    const { postUrn } = await createLinkedInPost({
      accessToken: credential.access_token,
      authorUrn: credential.author_urn,
      text: item.body as string,
    });

    await supabase
      .from('content_items')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_url: linkedInPostUrl(postUrn),
        publish_error: null,
      })
      .eq('id', item.id);

    if (credential.consecutive_failures > 0) {
      await supabase
        .from('social_credentials')
        .update({ consecutive_failures: 0, last_error: null, last_error_at: null })
        .eq('social_account_id', credential.social_account_id);
    }

    await supabase.from('agent_activity').insert({
      agent_name: 'charlie',
      action: 'social_published',
      status: 'auto',
      trigger_type: 'system',
      entity_type: 'content_item',
      entity_id: item.id,
      proposed_actions: [{ type: 'social_published', platform: 'linkedin', post_urn: postUrn }],
    });

    log.info({ contentItemId: item.id, postUrn }, 'published');
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MESSAGE_MAX_LEN);
    const attempts = item.publish_attempts + 1;

    await supabase
      .from('content_items')
      .update({
        publish_locked_at: null,
        publish_attempts: attempts,
        publish_error:
          attempts >= MAX_PUBLISH_ATTEMPTS ? `Failed after ${attempts} attempts: ${message}` : message,
      })
      .eq('id', item.id);

    if (err instanceof LinkedInAuthError) {
      await supabase
        .from('social_credentials')
        .update({
          consecutive_failures: credential.consecutive_failures + 1,
          last_error: message,
          last_error_at: new Date().toISOString(),
        })
        .eq('social_account_id', credential.social_account_id);
    }

    log.error({ err, contentItemId: item.id, attempts }, 'publish attempt failed');
  }
}

// ── Token expiry warnings ─────────────────────────────────────────────────────

/**
 * Daily: surface credentials within EXPIRY_WARNING_DAYS of expiry as an
 * agent_activity notice (deduped to one warning per account per week).
 * Exported for tests.
 */
export async function checkTokenExpiryWarnings(): Promise<void> {
  const now = Date.now();
  const horizon = new Date(now + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring, error } = await supabase
    .from('social_credentials')
    .select('social_account_id, expires_at')
    .lte('expires_at', horizon);

  if (error) throw error;

  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const credential of (expiring ?? []) as Array<{ social_account_id: string; expires_at: string }>) {
    const { data: recent } = await supabase
      .from('agent_activity')
      .select('id')
      .eq('action', 'linkedin_token_expiring')
      .eq('entity_id', credential.social_account_id)
      .gte('created_at', sevenDaysAgo);

    if (recent && recent.length > 0) continue;

    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(credential.expires_at).getTime() - now) / (24 * 60 * 60 * 1000)),
    );
    await supabase.from('agent_activity').insert({
      agent_name: 'simon',
      action: 'linkedin_token_expiring',
      status: 'auto',
      trigger_type: 'system',
      entity_type: 'social_account',
      entity_id: credential.social_account_id,
      notes: `LinkedIn token expires in ${daysLeft} day(s) — reconnect in Settings → Integrations → LinkedIn.`,
    });
    log.info({ socialAccountId: credential.social_account_id, daysLeft }, 'token expiry warning raised');
  }
}
