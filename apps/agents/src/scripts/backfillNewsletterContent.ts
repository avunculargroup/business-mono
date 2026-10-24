import { readFileSync, writeFileSync } from 'node:fs';
import { supabase } from '@platform/db';
import { isWrapperUrl, type NewsCategory, type NewsLinkExtractConfig } from '@platform/shared';
import { FastmailJmapClient, extractBody, getMessageId } from '../lib/fastmailJmap.js';
import {
  EMAIL_EXTRACTOR_VERSION,
  extractCanonicalUrl,
  getHtmlBody,
  htmlToMarkdown,
  normaliseMarkdown,
} from '../lib/newsletterExtract.js';
import { linkDenyReason } from '../lib/newsletterLinks.js';
import { cleanUrl, resolveRedirect, unwrapOffline } from '../lib/urlClean.js';
import {
  RESCORE_THRESHOLD,
  approvedRows,
  cleanStoredMarkdown,
  mergeCuratorNotes,
  parseCsv,
  planDuplicates,
  scoredWindowChange,
  toCsv,
  type BackfillRow,
} from '../lib/newsletterBackfill.js';
import { extractNewsMetadata } from '../workflows/newsExtract.js';
import { scoreNewsItem } from '../workflows/newsRubric.js';
import { mergeTopics } from '../workflows/ingestNewsItem.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill:newsletter');

/**
 * Cleans news_items rows stored before the newsletter extraction rework.
 * Spec: docs/news-source-email-extraction-spec.md#backfill-and-cleanup.
 *
 * Dry run by default: plans every change and writes a CSV report, touching
 * nothing. The write pass takes the reviewed CSV, re-plans, and runs only the
 * rows the report carries with the same action and target — and, for a row
 * that removes something (delete_filtered, delete_unresolvable, merge), only
 * with approve=yes. Nothing is removed that a person has not seen.
 *
 *   1. Email items whose message is still in the research folder (matched by
 *      Message-ID) are re-extracted with the new cleaner; the raw body goes to
 *      news_item_raw on the write pass.
 *   2. Email items whose message is gone get the markdown-level clean.
 *   3. Followed links move to their real URL — decoded offline, or resolved at
 *      one request a second — with ingestion_ref rebuilt on it (the old one
 *      embedded the wrapper, tokens included). Links that cannot be resolved,
 *      or whose real URL is now denied, are deletion candidates.
 *   4. Rows that now share a URL collapse into the higher-scored one: curator
 *      notes appended, reports.news_item_id and rex_metadata parents repointed.
 *   5. --rescore re-runs extraction and the rubric where the scored window
 *      changed by more than 20%. The dry run reports how many that is.
 *
 * Every row touched is copied to news_items_backfill_snapshot first. Drop that
 * table once the acceptance queries pass: it holds the tokens being removed.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, plus the model keys for
 * --rescore, with 20261024000000_newsletter_extraction applied.
 *
 *   pnpm --filter @platform/agents backfill:newsletter --out /tmp/newsletter-backfill.csv
 *   pnpm --filter @platform/agents backfill:newsletter --apply /tmp/newsletter-backfill.csv [--rescore]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGE = 1000;
const RESOLVE_INTERVAL_MS = 1000;
const RAW_PAGE = 250;
const MAX_RAW_CHARS = 1_048_576;

interface Args {
  apply: string | null;
  out: string;
  limit: number | null;
  rescore: boolean;
  skipRaw: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: null,
    out: `newsletter-backfill-${new Date().toISOString().slice(0, 10)}.csv`,
    limit: null,
    rescore: false,
    skipRaw: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = argv[++i] ?? null;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--rescore') args.rescore = true;
    else if (a === '--skip-raw') args.skipRaw = true;
  }
  if (args.limit !== null && !(args.limit > 0)) throw new Error('--limit needs a positive number');
  if (args.rescore && !args.apply) throw new Error('--rescore runs only on the write pass (--apply)');
  return args;
}

async function selectAll<T>(build: () => { range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One redirect chain a second, across the whole run. */
let lastResolve = 0;
async function throttledResolve(url: string): Promise<string | null> {
  const wait = lastResolve + RESOLVE_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastResolve = Date.now();
  return resolveRedirect(url);
}

async function throttledClean(url: string | null): Promise<string | null> {
  if (!url) return null;
  const offline = unwrapOffline(url);
  if (offline && !isWrapperUrl(offline)) return cleanUrl(offline);
  if (!isWrapperUrl(url)) return cleanUrl(url);
  const resolved = await throttledResolve(url);
  return resolved ? cleanUrl(resolved) : null;
}

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

interface Source {
  id: string;
  name: string;
  tier: string | null;
  sender_allowlist: string[];
  link_allow_patterns: string[];
  link_deny_patterns: string[];
  link_extract_config: NewsLinkExtractConfig;
}

interface Item {
  id: string;
  title: string;
  url: string;
  canonical_url: string | null;
  body_markdown: string | null;
  relevance_score: number | null;
  status: string;
  source_id: string;
  ingestion_ref: string | null;
  curator_notes: string | null;
  rex_metadata: Record<string, unknown> | null;
  created_at: string;
}

const ITEM_COLUMNS =
  'id, title, url, canonical_url, body_markdown, relevance_score, status, source_id, ingestion_ref, curator_notes, rex_metadata, created_at';

/** What the write pass needs for a planned row that the CSV doesn't carry. */
interface PlannedChange {
  body?: string;
  canonicalUrl?: string | null;
  url?: string;
  ingestionRef?: string | null;
}

interface Plan {
  rows: BackfillRow[];
  changes: Map<string, PlannedChange>;
  items: Map<string, Item>;
  sources: Map<string, Source>;
}

function baseRow(item: Item, source: Source | undefined): Omit<BackfillRow, 'action'> {
  return {
    id: item.id,
    source: source?.name ?? '',
    title: item.title,
    oldUrlHost: hostOf(item.url),
    newUrl: '',
    keepId: '',
    reason: '',
    bodyChangePct: '',
    rescore: 'no',
    approve: '',
  };
}

function bodyChange(item: Item, body: string): Pick<BackfillRow, 'bodyChangePct' | 'rescore'> {
  const change = scoredWindowChange(item.body_markdown ?? '', body);
  return { bodyChangePct: (change * 100).toFixed(1), rescore: change > RESCORE_THRESHOLD ? 'yes' : 'no' };
}

/**
 * Walks each research folder once, newest first, and hands every message that
 * matches a planned email item to `onMessage`. Paging the folder costs a few
 * dozen JMAP calls; a query per item would cost thousands.
 */
async function forEachResearchMessage(
  byRef: Map<string, Item>,
  onMessage: (item: Item, html: string | null, plain: string | null) => Promise<void>,
): Promise<void> {
  const { data: accounts, error } = await db
    .from('fastmail_accounts')
    .select('id, username, token, research_folder, is_active');
  if (error) throw new Error(error.message);
  for (const account of (accounts ?? []) as Array<{ username: string; token: string; research_folder: string | null; is_active: boolean }>) {
    if (!account.is_active || !account.research_folder) continue;
    const client = new FastmailJmapClient(account.username, account.token);
    const { accountId, apiUrl } = await client.getSession();
    const folderId = await client.getMailboxIdByName(accountId, apiUrl, account.research_folder);
    if (!folderId) continue;
    for (let position = 0; ; position += RAW_PAGE) {
      const page = await client.queryMailboxPage(accountId, apiUrl, folderId, position, RAW_PAGE);
      const emails = await client.getEmails(accountId, apiUrl, page.ids);
      for (const email of emails) {
        const mid = getMessageId(email);
        const item = mid ? byRef.get(mid) : undefined;
        if (!item) continue;
        byRef.delete(mid!);
        const html = getHtmlBody(email);
        await onMessage(item, html, html ? null : extractBody(email));
      }
      log.info({ account: account.username, position, total: page.total }, 'research folder page read');
      if (page.ids.length < RAW_PAGE || position + RAW_PAGE >= page.total) break;
    }
  }
}

async function buildPlan(args: Args, onRaw?: (item: Item, format: 'html' | 'text', raw: string) => Promise<void>): Promise<Plan> {
  const sourceRows = await selectAll<Source>(() =>
    db
      .from('news_sources')
      .select('id, name, tier, sender_allowlist, link_allow_patterns, link_deny_patterns, link_extract_config')
      .eq('source_type', 'email')
      .order('id'),
  );
  const sources = new Map(sourceRows.map((s) => [s.id, s]));
  let all = await selectAll<Item>(() =>
    db.from('news_items').select(ITEM_COLUMNS).in('source_id', [...sources.keys()]).order('created_at'),
  );
  if (args.limit) all = all.slice(0, args.limit);
  const items = new Map(all.map((i) => [i.id, i]));
  const isFollowed = (i: Item) => Boolean(i.rex_metadata && 'from_newsletter_item_id' in i.rex_metadata);
  const parents = all.filter((i) => !isFollowed(i));
  const followed = all.filter(isFollowed);
  log.info({ sources: sources.size, emailItems: parents.length, followed: followed.length }, 'planning');

  const rows: BackfillRow[] = [];
  const changes = new Map<string, PlannedChange>();

  // 1–2. Email items: re-extract from the raw message where it still exists.
  const planEmail = async (item: Item, body: string, canonicalUrl: string | null, reason: string) => {
    if (body === (item.body_markdown ?? '') && canonicalUrl === item.canonical_url) return;
    changes.set(item.id, { body, canonicalUrl });
    rows.push({
      ...baseRow(item, sources.get(item.source_id)),
      action: 'update_body',
      newUrl: canonicalUrl ?? '',
      reason,
      ...bodyChange(item, body),
    });
  };

  const byRef = new Map(parents.filter((p) => p.ingestion_ref).map((p) => [p.ingestion_ref!, p]));
  if (!args.skipRaw) {
    await forEachResearchMessage(byRef, async (item, html, plain) => {
      const body = html ? htmlToMarkdown(html, { subject: item.title }) : normaliseMarkdown(plain ?? '', { subject: item.title });
      const rawCanonical = html ? extractCanonicalUrl(html) : null;
      const canonicalUrl = rawCanonical ? await throttledClean(rawCanonical) : null;
      if (onRaw) await onRaw(item, html ? 'html' : 'text', html ?? plain ?? '');
      await planEmail(item, body, canonicalUrl, 'raw message re-extracted');
    });
  }
  for (const item of byRef.values()) {
    const body = cleanStoredMarkdown(item.body_markdown ?? '', item.title);
    const canonicalUrl = await throttledClean(item.canonical_url);
    await planEmail(item, body, canonicalUrl, 'raw message gone — markdown clean');
  }
  for (const item of parents.filter((p) => !p.ingestion_ref)) {
    await planEmail(item, cleanStoredMarkdown(item.body_markdown ?? '', item.title), await throttledClean(item.canonical_url), 'no Message-ID — markdown clean');
  }

  // 3. Followed links: the real URL, then the rules that should have applied.
  const survivors: Array<{ item: Item; url: string }> = [];
  for (const item of followed) {
    const source = sources.get(item.source_id);
    const real = await throttledClean(item.url);
    if (!real) {
      rows.push({ ...baseRow(item, source), action: 'delete_unresolvable', reason: 'wrapper could not be resolved' });
      continue;
    }
    const parent = items.get(String(item.rex_metadata?.['from_newsletter_item_id'] ?? ''));
    const selfHosts = [
      ...(source?.sender_allowlist ?? []).map((e) => (e.includes('@') ? e.split('@')[1]! : e)),
      hostOf(parent?.canonical_url ?? null),
    ].filter(Boolean);
    const denied = linkDenyReason(real, {
      selfHosts,
      allowPatterns: source?.link_allow_patterns ?? [],
      denyPatterns: source?.link_deny_patterns ?? [],
    });
    if (denied) {
      rows.push({ ...baseRow(item, source), action: 'delete_filtered', newUrl: real, reason: denied });
      continue;
    }
    survivors.push({ item, url: real });
  }

  // 4. Duplicates — among survivors, and against clean rows already stored.
  const finalUrls = [...new Set(survivors.map((s) => s.url))];
  const existing: Item[] = [];
  for (let i = 0; i < finalUrls.length; i += 200) {
    const { data, error } = await db.from('news_items').select(ITEM_COLUMNS).in('url', finalUrls.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Item[]) if (!items.has(row.id)) existing.push(row);
  }
  for (const row of existing) items.set(row.id, row);
  const dupPlan = planDuplicates([
    ...survivors.map((s) => ({ id: s.item.id, url: s.url, relevanceScore: s.item.relevance_score, createdAt: s.item.created_at })),
    ...existing.map((e) => ({ id: e.id, url: e.url, relevanceScore: e.relevance_score, createdAt: e.created_at })),
  ]);
  const merged = new Set<string>();
  for (const d of dupPlan) {
    for (const id of d.remove) {
      const item = items.get(id)!;
      merged.add(id);
      rows.push({ ...baseRow(item, sources.get(item.source_id)), action: 'merge', newUrl: d.url, keepId: d.keep, reason: 'same real URL' });
    }
  }

  for (const { item, url } of survivors) {
    if (merged.has(item.id)) continue;
    const body = normaliseMarkdown(item.body_markdown ?? '');
    const urlChanged = url !== item.url;
    if (!urlChanged && body === (item.body_markdown ?? '')) continue;
    const parentRef = item.ingestion_ref?.split('#link:')[0];
    const ingestionRef = urlChanged && parentRef ? `${parentRef}#link:${url}` : item.ingestion_ref;
    changes.set(item.id, { url, body, ingestionRef });
    rows.push({
      ...baseRow(item, sources.get(item.source_id)),
      action: urlChanged ? 'update_url' : 'update_body',
      newUrl: url,
      reason: urlChanged ? 'moved to real URL' : 'body normalised',
      ...bodyChange(item, body),
    });
  }

  return { rows, changes, items, sources };
}

// ── Write pass ────────────────────────────────────────────────────────────────

async function snapshot(plan: Plan, rows: BackfillRow[]): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.id))];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200).map((id) => {
      const it = plan.items.get(id)!;
      return {
        id,
        url: it.url,
        canonical_url: it.canonical_url,
        ingestion_ref: it.ingestion_ref,
        body_markdown: it.body_markdown,
        relevance_score: it.relevance_score,
        status: it.status,
      };
    });
    // ignoreDuplicates: a re-run must never overwrite the original copy.
    const { error } = await db.from('news_items_backfill_snapshot').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`snapshot failed: ${error.message}`);
  }
}

async function applyMerge(plan: Plan, row: BackfillRow): Promise<void> {
  const keeper = plan.items.get(row.keepId)!;
  const dup = plan.items.get(row.id)!;
  const notes = mergeCuratorNotes(keeper.curator_notes, [dup.curator_notes]);
  if (notes !== keeper.curator_notes) {
    await db.from('news_items').update({ curator_notes: notes }).eq('id', keeper.id);
    keeper.curator_notes = notes;
  }
  await db.from('reports').update({ news_item_id: keeper.id }).eq('news_item_id', dup.id);
  const { data: children } = await db
    .from('news_items')
    .select('id, rex_metadata')
    .eq('rex_metadata->>from_newsletter_item_id', dup.id);
  for (const child of (children ?? []) as Array<{ id: string; rex_metadata: Record<string, unknown> }>) {
    await db
      .from('news_items')
      .update({ rex_metadata: { ...child.rex_metadata, from_newsletter_item_id: keeper.id } })
      .eq('id', child.id);
  }
  const { error } = await db.from('news_items').delete().eq('id', dup.id);
  if (error) throw new Error(error.message);
}

async function rescore(plan: Plan, row: BackfillRow, body: string): Promise<void> {
  const item = plan.items.get(row.id)!;
  const source = plan.sources.get(item.source_id);
  const followed = Boolean(item.rex_metadata && 'from_newsletter_item_id' in item.rex_metadata);
  const { data: extracted } = await extractNewsMetadata({
    title: item.title,
    source: source?.name ?? '',
    content: body.slice(0, 12000),
    scopeKey: followed ? 'newsletterLinks.extract' : undefined,
  });
  // No novelty neighbours: the rubric reads "None on file", which can only
  // raise novelty. Acceptable for a one-off re-score of rows already stored.
  const scored = await scoreNewsItem({
    title: item.title,
    body,
    sourceName: source?.name ?? '',
    sourceTier: source?.tier ?? null,
    similar: [],
    scopeKey: followed ? 'newsletterLinks.rubric_score' : undefined,
  });
  const extra = { ...(item.rex_metadata ?? {}) };
  for (const k of ['dimension_scores', 'flags', 'needs_human_review', 'rubric_version', 'scoring_failed']) delete extra[k];
  const update: Record<string, unknown> = {
    status: extracted ? (item.status === 'extraction_failed' ? 'new' : item.status) : item.status,
  };
  if (extracted) {
    Object.assign(update, {
      category: extracted.category as NewsCategory,
      key_points: extracted.key_points,
      australian_relevance: extracted.australian_relevance,
    });
  }
  if (scored) {
    Object.assign(update, {
      summary: scored.summary,
      topic_tags: mergeTopics(extracted?.topic_tags ?? [], scored.topics),
      relevance_score: scored.relevanceScore,
      relevance_reasoning: scored.relevanceReasoning,
      rex_metadata: {
        ...extra,
        dimension_scores: scored.dimensionScores,
        flags: scored.flags,
        needs_human_review: scored.needsHumanReview,
        rubric_version: scored.rubricVersion,
      },
    });
  }
  await db.from('news_items').update(update).eq('id', item.id);
}

async function applyPlan(plan: Plan, approved: BackfillRow[], args: Args): Promise<void> {
  await snapshot(plan, approved);
  const counts: Record<string, number> = {};
  const done = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  // Removals first, so a URL a merge frees is available to the update after it.
  for (const row of approved.filter((r) => r.action === 'merge')) {
    await applyMerge(plan, row);
    done('merge');
  }
  for (const row of approved.filter((r) => r.action === 'delete_filtered' || r.action === 'delete_unresolvable')) {
    const { error } = await db.from('news_items').delete().eq('id', row.id);
    if (error) log.warn({ err: error, id: row.id }, 'delete failed');
    else done(row.action);
  }
  for (const row of approved.filter((r) => r.action === 'update_url' || r.action === 'update_body')) {
    const change = plan.changes.get(row.id)!;
    const update: Record<string, unknown> = {};
    if (change.body !== undefined) update['body_markdown'] = change.body;
    if (change.canonicalUrl !== undefined) update['canonical_url'] = change.canonicalUrl;
    if (change.url !== undefined) update['url'] = change.url;
    if (change.ingestionRef !== undefined) update['ingestion_ref'] = change.ingestionRef;
    const { error } = await db.from('news_items').update(update).eq('id', row.id);
    if (error) {
      log.warn({ err: error, id: row.id }, 'update failed');
      continue;
    }
    done(row.action);
    if (args.rescore && row.rescore === 'yes' && change.body !== undefined) {
      await rescore(plan, row, change.body);
      done('rescore');
    }
  }
  log.info({ counts }, 'write pass complete');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.apply) {
    const plan = await buildPlan(args);
    writeFileSync(args.out, toCsv(plan.rows));
    const byAction: Record<string, number> = {};
    for (const r of plan.rows) byAction[r.action] = (byAction[r.action] ?? 0) + 1;
    log.info(
      { out: args.out, byAction, rescoreCandidates: plan.rows.filter((r) => r.rescore === 'yes').length },
      'dry run complete — review the report, set approve=yes on removals, then run --apply with it',
    );
    return;
  }

  const reviewed = parseCsv(readFileSync(args.apply, 'utf8'));
  const rawIds = new Set(reviewed.filter((r) => r.action === 'update_body').map((r) => r.id));
  const plan = await buildPlan(args, async (item, format, raw) => {
    if (!rawIds.has(item.id)) return;
    const { error } = await db.from('news_item_raw').upsert(
      {
        news_item_id: item.id,
        format,
        raw: raw.slice(0, MAX_RAW_CHARS),
        raw_chars: raw.length,
        extractor_version: EMAIL_EXTRACTOR_VERSION,
      },
      { onConflict: 'news_item_id' },
    );
    if (error) log.warn({ err: error, id: item.id }, 'raw body not stored');
  });
  const approved = approvedRows(plan.rows, reviewed);
  const unmatched = reviewed.length - approved.length;
  log.info({ planned: plan.rows.length, approved: approved.length, notApplied: unmatched }, 'applying reviewed report');
  await applyPlan(plan, approved, args);
}

main().catch((err) => {
  log.error({ err }, 'backfill failed');
  process.exit(1);
});
