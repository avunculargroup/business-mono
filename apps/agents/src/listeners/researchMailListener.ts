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
import { extractNewsletterLinks } from '../lib/newsletterLinks.js';
import { fetchUrl } from '../agents/researcher/tools.js';
import { fetchOgImage } from '../lib/fetchOgImage.js';
import { extractNewsMetadata } from '../workflows/newsExtract.js';
import { ingestNewsItem } from '../workflows/ingestNewsItem.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('research-mail');
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Ceiling on followed links across every source in one poll cycle. The
// per-source cap alone is meaningless when several newsletters land in the
// same five-minute window — eight sources at five links each would be eighty
// LLM calls before the next tick.
const MAX_FOLLOWED_LINKS_PER_CYCLE = 20;

// Followed articles shorter than this are paywall stubs or navigation shells,
// not content. Higher than the RSS path's 200 because there we still have a
// real feed summary to fall back on; here we have nothing.
const MIN_FOLLOWED_BODY_CHARS = 1000;

const PAYWALL_RE =
  /subscribe to (?:continue|read)|create an account to|this content is for (?:subscribers|members)|already a (?:subscriber|member)\?/i;

// Model scopes for the followed-link path, configurable at /settings/models
// independently of the RSS/feed ingestion steps.
const LINK_EXTRACT_SCOPE = 'newsletterLinks.extract';
const LINK_RUBRIC_SCOPE = 'newsletterLinks.rubric_score';

export interface EmailSource {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  sender_allowlist: string[];
  follow_links: boolean;
  max_followed_links: number;
}

/** Mutable per-poll-cycle allowance, shared across accounts and sources. */
export interface LinkBudget {
  remaining: number;
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

// Following links turns a cycle that used to take seconds into one that can
// take minutes, so overlapping ticks are now a real possibility.
let polling = false;

async function pollAllResearchAccounts(): Promise<void> {
  if (polling) {
    log.info('previous poll cycle still running — skipping this tick');
    return;
  }
  polling = true;
  try {
    await runPollCycle();
  } finally {
    polling = false;
  }
}

async function runPollCycle(): Promise<void> {
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
        .select('id, name, slug, tier, sender_allowlist, follow_links, max_followed_links, is_active, source_type')
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

  const budget: LinkBudget = { remaining: MAX_FOLLOWED_LINKS_PER_CYCLE };

  for (const account of accounts) {
    try {
      await pollResearchAccount(account, sourcesBySlug, budget);
    } catch (err) {
      log.error({ err, account: account.username }, 'error polling account');
    }
  }
}

// ── Poll a single account's research folder ─────────────────────────────────────

async function pollResearchAccount(
  account: ResearchAccount,
  sourcesBySlug: Map<string, EmailSource>,
  budget: LinkBudget,
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
        const outcome = await processResearchEmail(email, sourcesBySlug, budget);
        if (outcome.status === 'skipped') {
          log.info({ emailId: email.id, reason: outcome.reason }, 'skipped');
        } else if (outcome.status === 'ingested') {
          log.info(
            {
              emailId: email.id,
              newsItemId: outcome.newsItemId,
              score: outcome.relevanceScore ?? 'n/a',
              linksIngested: outcome.followedLinks?.ingested ?? 0,
              linksSkipped: outcome.followedLinks?.skipped ?? 0,
            },
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
  | {
      status: 'ingested';
      newsItemId?: string;
      relevanceScore?: number | null;
      /** Present only when the source has link following enabled. */
      followedLinks?: { ingested: number; skipped: number };
    }
  | { status: 'duplicate'; reason?: string }
  | { status: 'skipped'; reason: string };

export async function processResearchEmail(
  email: JmapEmail,
  sourcesBySlug: Map<string, EmailSource>,
  budget?: LinkBudget,
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

  // 5. Follow the links in the body, when the source opts in. Only on a fresh
  //    insert — a re-delivered newsletter would otherwise pay for N fetches and
  //    2N LLM calls before per-link dedup caught up with it.
  let followedLinks: { ingested: number; skipped: number } | undefined;
  if (source.follow_links && html && result.newsItemId) {
    followedLinks = await ingestNewsletterLinks({
      html,
      source,
      parentNewsItemId: result.newsItemId,
      parentIngestionRef: ingestionRef,
      excludeUrls: [url, canonicalUrl].filter((u): u is string => Boolean(u)),
      budget: budget ?? { remaining: MAX_FOLLOWED_LINKS_PER_CYCLE },
    });
  }

  return {
    status: 'ingested',
    newsItemId: result.newsItemId,
    relevanceScore: result.relevanceScore,
    ...(followedLinks ? { followedLinks } : {}),
  };
}

// ── Follow the links inside a newsletter ────────────────────────────────────────

/**
 * Fetches each substantive link in a newsletter and ingests it as its own
 * news_items row. Sequential by design: every link is two serialised LLM calls
 * regardless, and concurrency would risk Jina's unauthenticated rate limit.
 *
 * Children carry `{parentRef}#link:{url}` as their ingestion_ref — unique per
 * source_id, so a re-delivered issue is deduped before any spend — and the
 * parent id in rex_metadata for queryability.
 */
export async function ingestNewsletterLinks(args: {
  html: string;
  source: EmailSource;
  parentNewsItemId: string;
  parentIngestionRef: string;
  excludeUrls: string[];
  budget: LinkBudget;
}): Promise<{ ingested: number; skipped: number }> {
  const { html, source, parentNewsItemId, parentIngestionRef, excludeUrls, budget } = args;

  const max = Math.min(source.max_followed_links, budget.remaining);
  if (max <= 0) {
    log.warn({ source: source.name }, 'link budget exhausted for this poll cycle');
    return { ingested: 0, skipped: 0 };
  }

  const links = extractNewsletterLinks(html, { max, excludeUrls });
  let ingested = 0;
  let skipped = 0;

  for (const link of links) {
    if (budget.remaining <= 0) {
      log.warn({ source: source.name }, 'link budget exhausted mid-newsletter');
      break;
    }
    budget.remaining -= 1;

    // Every candidate is logged so the deny-lists can be tuned from real
    // newsletters rather than guesses.
    log.info({ source: source.name, url: link.url }, 'following newsletter link');

    try {
      const fetched = (await fetchUrl.execute!({ url: link.url } as never, {} as never)) as
        | { title?: string; markdown?: string; resolved_url?: string }
        | undefined;

      const markdown = fetched?.markdown?.trim() ?? '';
      if (markdown.length < MIN_FOLLOWED_BODY_CHARS) {
        skipped += 1;
        log.info({ url: link.url, chars: markdown.length }, 'link skipped — body too short');
        continue;
      }
      if (PAYWALL_RE.test(markdown.slice(0, 2000))) {
        skipped += 1;
        log.info({ url: link.url }, 'link skipped — paywall stub');
        continue;
      }

      // Jina follows redirects server-side, so this unwraps tracking wrappers.
      const url = fetched?.resolved_url ?? link.url;
      const title = fetched?.title?.trim() || link.anchorText || link.url;
      const imageUrl = await fetchOgImage(url);

      const { data: extracted } = await extractNewsMetadata({
        title,
        source: source.name,
        content: markdown.slice(0, 12000),
        scopeKey: LINK_EXTRACT_SCOPE,
      });

      const result = await ingestNewsItem({
        source: { id: source.id, name: source.name, tier: source.tier },
        title,
        body: markdown,
        fallbackSummary: extracted?.summary ?? title,
        category: (extracted?.category ?? 'macro') as NewsCategory,
        keyPoints: extracted?.key_points ?? [],
        topicTags: extracted?.topic_tags ?? [],
        australianRelevance: extracted?.australian_relevance ?? false,
        publishedAt: null,
        url,
        imageUrl,
        ingestionRef: `${parentIngestionRef}#link:${link.url}`,
        ingestedBy: 'rex',
        rubricScopeKey: LINK_RUBRIC_SCOPE,
        rexMetadataExtra: {
          from_newsletter_item_id: parentNewsItemId,
          from_newsletter_anchor_text: link.anchorText || null,
        },
        status: extracted ? 'new' : 'extraction_failed',
      });

      if (result.status === 'inserted') {
        ingested += 1;
        log.info({ url, newsItemId: result.newsItemId, score: result.relevanceScore ?? 'n/a' }, 'link → news_item');
      } else {
        skipped += 1;
        log.info({ url, status: result.status, reason: result.reason }, 'link not stored');
      }
    } catch (err) {
      skipped += 1;
      log.warn({ err, url: link.url }, 'link failed — skipping');
    }
  }

  return { ingested, skipped };
}
