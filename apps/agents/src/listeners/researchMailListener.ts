/**
 * Research newsletter polling listener
 *
 * Separate from fastmailListener (CRM): polls each Fastmail account's
 * configured research folder, where paid newsletters arrive via per-source
 * plus-addresses (research+{slug}@<domain>). Each message is routed to its
 * news_sources row by slug, validated (sender allowlist + SPF/DKIM), converted
 * to clean markdown, and fed into the shared news ingestion pipeline — landing
 * in news_items alongside RSS/podcast content. These emails never become CRM
 * interactions and never reach Della.
 *
 * The CRM marketing-header filter (shouldSkipEmail) is deliberately NOT applied:
 * newsletters carry exactly the List-Unsubscribe/bulk headers it skips on. Trust
 * comes from the dedicated folder + sender allowlist + authentication results.
 *
 * Accounts and sources are read from the DB every cycle, so changes take effect
 * within one poll interval without redeployment.
 */

import { supabase } from '@platform/db';
import type { NewsCategory } from '@platform/shared';
import {
  FastmailJmapClient,
  extractBody,
  extractResearchSlug,
  getMessageId,
  isAuthFail,
  hasPdfAttachment,
  attachmentCount,
  type JmapEmail,
} from '../lib/fastmailJmap.js';
import {
  getHtmlBody,
  htmlToMarkdown,
  extractCanonicalUrl,
  synthesizeEmailUrl,
  senderAllowed,
} from '../lib/newsletterExtract.js';
import { extractNewsMetadata } from '../workflows/newsExtract.js';
import { ingestNewsItem } from '../workflows/ingestNewsItem.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('research-mail');
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface EmailSource {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  sender_allowlist: string[];
}

type ResearchAccount = {
  id: string;
  username: string;
  token: string;
  research_folder: string;
};

// ── Entry point ───────────────────────────────────────────────────────────────

export function startResearchMailListener(): void {
  log.info('starting research newsletter polling (5-minute interval)');
  void pollAllResearchAccounts();
  setInterval(() => void pollAllResearchAccounts(), POLL_INTERVAL_MS);
}

// ── Poll all accounts ─────────────────────────────────────────────────────────

async function pollAllResearchAccounts(): Promise<void> {
  let accounts: ResearchAccount[];
  let sourcesBySlug: Map<string, EmailSource>;

  try {
    const [accountsRes, sourcesRes] = await Promise.all([
      // research_folder isn't in the generated types until post-migration regen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from('fastmail_accounts').select('id, username, token, research_folder, is_active') as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase
        .from('news_sources')
        .select('id, name, slug, tier, sender_allowlist, is_active, source_type')
        .eq('source_type' as any, 'email')
        .eq('is_active', true) as any),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (sourcesRes.error) throw sourcesRes.error;

    accounts = ((accountsRes.data ?? []) as Array<ResearchAccount & { is_active: boolean }>)
      .filter((a) => a.is_active && a.research_folder);

    sourcesBySlug = new Map();
    for (const s of (sourcesRes.data ?? []) as Array<EmailSource & { slug: string | null }>) {
      if (s.slug) sourcesBySlug.set(s.slug.toLowerCase(), s);
    }
  } catch (err) {
    log.error({ err }, 'failed to load config from DB');
    return;
  }

  if (accounts.length === 0) return;
  if (sourcesBySlug.size === 0) {
    log.info('no active email sources configured — skipping poll cycle');
    return;
  }

  for (const account of accounts) {
    try {
      await pollResearchAccount(account, sourcesBySlug);
    } catch (err) {
      log.error({ err, account: account.username }, 'error polling account');
    }
  }
}

// ── Poll a single account's research folder ─────────────────────────────────────

async function pollResearchAccount(
  account: ResearchAccount,
  sourcesBySlug: Map<string, EmailSource>,
): Promise<void> {
  const client = new FastmailJmapClient(account.username, account.token);
  const { accountId, apiUrl } = await client.getSession();

  const folderId = await client.getMailboxIdByName(accountId, apiUrl, account.research_folder);
  if (!folderId) {
    log.warn(
      { folder: account.research_folder, account: account.username },
      'research folder not found — skipping',
    );
    return;
  }

  const { data: syncRow } = await supabase
    .from('fastmail_sync_state')
    .select('research_query_state')
    .eq('account_id', account.id)
    .single();

  const queryState = (syncRow as { research_query_state?: string } | null)?.research_query_state ?? undefined;

  const result = await client.queryEmailIds(accountId, apiUrl, folderId, queryState);
  if (result.emailIds.length > 0) {
    const emails = await client.getEmails(accountId, apiUrl, result.emailIds);
    for (const email of emails) {
      try {
        const outcome = await processResearchEmail(email, sourcesBySlug);
        if (outcome.status === 'skipped') {
          log.info({ emailId: email.id, reason: outcome.reason }, 'skipped');
        } else if (outcome.status === 'ingested') {
          log.info(
            { emailId: email.id, newsItemId: outcome.newsItemId, score: outcome.relevanceScore ?? 'n/a' },
            'ingested → news_item',
          );
        }
      } catch (err) {
        log.error({ err, emailId: email.id, account: account.username }, 'error processing email');
      }
    }
  }

  await supabase.from('fastmail_sync_state').upsert(
    {
      account_id: account.id,
      jmap_account_id: accountId,
      research_query_state: result.newQueryState,
      last_synced_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    { onConflict: 'account_id' },
  );

  log.info(
    { account: account.username, folder: account.research_folder, checked: result.emailIds.length },
    'polled research folder',
  );
}

// ── Process a single research email ─────────────────────────────────────────────

export type ResearchEmailOutcome =
  | { status: 'ingested'; newsItemId?: string; relevanceScore?: number | null }
  | { status: 'duplicate'; reason?: string }
  | { status: 'skipped'; reason: string };

export async function processResearchEmail(
  email: JmapEmail,
  sourcesBySlug: Map<string, EmailSource>,
): Promise<ResearchEmailOutcome> {
  // 1. Route by plus-address slug.
  const slug = extractResearchSlug(email);
  if (!slug) return { status: 'skipped', reason: 'no_plus_address' };
  const source = sourcesBySlug.get(slug.toLowerCase());
  if (!source) return { status: 'skipped', reason: `unknown_source:${slug}` };

  // 2. Sender + authentication validation.
  const fromEmail = email.from?.[0]?.email?.toLowerCase() ?? '';
  if (!senderAllowed(fromEmail, source.sender_allowlist)) {
    return { status: 'skipped', reason: `sender_not_allowed:${fromEmail}` };
  }
  if (isAuthFail(email.headers)) {
    return { status: 'skipped', reason: 'auth_fail' };
  }

  // 3. Content: HTML → markdown (chrome stripped), or plain-text fallback.
  const html = getHtmlBody(email);
  const body = html ? htmlToMarkdown(html) : extractBody(email);
  if (!body.trim()) return { status: 'skipped', reason: 'empty_body' };

  const title = email.subject?.trim() || '(untitled newsletter)';
  const author = email.from?.[0]?.name?.trim() || fromEmail || null;
  const messageId = getMessageId(email);
  // Idempotency key: Message-ID when present, else a stable composite.
  const ingestionRef = messageId ?? `${slug}:${email.receivedAt}:${title}`;
  const canonicalUrl = html ? extractCanonicalUrl(html) : null;
  // url stays synthetic + deterministic per message (canonical link lives in
  // canonical_url) so news_items.url never collides on a shared "view online" base.
  const url = synthesizeEmailUrl(slug, ingestionRef);

  // 4. Structural metadata (category, key points, tags) — the rubric scores
  //    separately inside ingestNewsItem.
  const { data: extracted } = await extractNewsMetadata({
    title,
    source: source.name,
    content: body.slice(0, 12000),
  });

  const result = await ingestNewsItem({
    source: { id: source.id, name: source.name, tier: source.tier },
    title,
    body,
    fallbackSummary: extracted?.summary ?? title,
    category: (extracted?.category ?? 'macro') as NewsCategory,
    keyPoints: extracted?.key_points ?? [],
    topicTags: extracted?.topic_tags ?? [],
    australianRelevance: extracted?.australian_relevance ?? false,
    author,
    publishedAt: email.receivedAt,
    url,
    canonicalUrl,
    ingestionRef,
    hasPdfAttachment: hasPdfAttachment(email),
    attachmentCount: attachmentCount(email),
    ingestedBy: 'rex',
  });

  if (result.status === 'duplicate') return { status: 'duplicate', reason: result.reason };
  if (result.status === 'failed') return { status: 'skipped', reason: `ingest_failed:${result.reason ?? 'unknown'}` };
  return { status: 'ingested', newsItemId: result.newsItemId, relevanceScore: result.relevanceScore };
}
