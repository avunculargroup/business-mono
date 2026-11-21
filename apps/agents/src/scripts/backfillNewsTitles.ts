import { supabase } from '@platform/db';
import {
  cleanNewsTitle,
  isGenericTitle,
  type HeadlineCandidate,
} from '@platform/shared';
import { fetchPageMeta } from '../lib/fetchOgImage.js';
import { finaliseHeadline, hostnameOf, pageCandidates, resolveNewsHeadline } from '../lib/newsTitle.js';
import { generateHeadline } from '../workflows/newsExtract.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill:news-titles');

/**
 * Re-resolves news_items.title for rows whose stored title is a page template,
 * a site name, or shared with a different url from the same source — the rows
 * that predate the shared headline resolver (packages/shared/src/newsTitle.ts).
 *
 * Per row: fetchPageMeta(url) → resolveHeadline (the taken check already
 * excludes the row itself, by url). Still generic → one small model call over
 * the stored body (first 4k characters), same headline instruction and
 * extractor model scope as ingest. email:// rows skip the page fetch.
 *
 * Dry run by default: prints id | old | new | from and writes nothing. --apply
 * writes title and merges rex_metadata.title_source. Embeddings are NOT
 * refreshed; the count of changed rows is printed so that can be decided.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the extractor's model key.
 *
 *   pnpm --filter @platform/agents backfill:news-titles [--days 90] [--limit N]
 *   pnpm --filter @platform/agents backfill:news-titles --apply [--days 90] [--limit N]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGE = 500;
const CONCURRENCY = 4;
const BODY_CHARS = 4000;

interface Args {
  apply: boolean;
  days: number;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    days: Number(value('--days') ?? 90),
    limit: value('--limit') ? Number(value('--limit')) : null,
  };
}

interface Row {
  id: string;
  title: string;
  url: string;
  source_id: string | null;
  source_name: string | null;
  body_markdown: string | null;
  rex_metadata: Record<string, unknown> | null;
}

const sourceKey = (r: Row) => r.source_id ?? `name:${r.source_name ?? ''}`;

async function loadRows(since: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('news_items')
      .select('id, title, url, source_id, source_name, body_markdown, rex_metadata')
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`news_items read failed: ${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const parentOf = (r: Row) => (r.rex_metadata?.['from_newsletter_item_id'] as string | undefined) ?? null;

/**
 * Rows with a generic title, or a title another url from the same source also
 * carries. A newsletter and the article it links to sharing a headline is one
 * article, not a repeat: a child whose parent is in the same group is not counted.
 */
function selectSuspect(rows: Row[]): Array<{ row: Row; why: string }> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${sourceKey(r)}\u0000${r.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const urlsByTitle = new Map<string, Set<string>>();
  for (const [key, group] of groups) {
    const ids = new Set(group.map((r) => r.id));
    urlsByTitle.set(key, new Set(group.filter((r) => !ids.has(parentOf(r) ?? '')).map((r) => r.url)));
  }
  const out: Array<{ row: Row; why: string }> = [];
  for (const r of rows) {
    const g = isGenericTitle(r.title, { sourceName: r.source_name, hostname: hostnameOf(r.url) });
    if (g.generic) {
      out.push({ row: r, why: g.reason ?? 'generic' });
    } else if ((urlsByTitle.get(`${sourceKey(r)}\u0000${r.title}`)?.size ?? 0) > 1) {
      out.push({ row: r, why: 'shared' });
    }
  }
  return out;
}

interface Change {
  id: string;
  old: string;
  next: string;
  from: string;
  titleSource: Record<string, unknown>;
}

async function resolveRow(row: Row, shared: boolean): Promise<Change | null> {
  const isEmail = row.url.startsWith('email://');
  const sourceName = row.source_name ?? 'News';
  const candidates: HeadlineCandidate[] = [];
  let siteName: string | null = null;

  if (isEmail) {
    candidates.push({ kind: 'subject', title: row.title });
  } else {
    const meta = await fetchPageMeta(row.url);
    siteName = meta.titles.siteName;
    candidates.push(
      ...pageCandidates(meta.titles),
      { kind: 'search', title: row.title },
      { kind: 'fetched', title: meta.titles.htmlTitle },
    );
  }

  const headline = await resolveNewsHeadline({
    candidates,
    sourceName,
    sourceId: row.source_id,
    url: row.url,
    siteName,
    includeSlug: !isEmail,
    // The stored title is repeated across urls; the DB may hold it uncleaned,
    // so the lookup alone would not catch it.
    alsoTaken: shared ? [cleanNewsTitle(row.title, { sourceName, siteName, hostname: hostnameOf(row.url) })] : [],
    relatedIds: [row.id, ...(parentOf(row) ? [parentOf(row)!] : [])],
  });

  let modelHeadline: string | null = null;
  if (headline.resolution.needsModelHeadline && row.body_markdown) {
    modelHeadline = await generateHeadline({
      title: headline.resolution.title,
      source: sourceName,
      content: row.body_markdown.slice(0, BODY_CHARS),
    });
  }
  const { title, titleSource } = finaliseHeadline(headline, modelHeadline);
  if (!title || title === row.title || title === cleanNewsTitle(row.title)) return null;
  return {
    id: row.id,
    old: row.title,
    next: title,
    from: titleSource?.from ?? headline.resolution.from,
    titleSource: titleSource ?? { from: headline.resolution.from, rejected: headline.resolution.rejected },
  };
}

function cell(s: string, width: number): string {
  const flat = s.replace(/\s+/g, ' ');
  return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat.padEnd(width);
}

function printTable(changes: Change[], unchanged: number): void {
  const out = process.stdout;
  out.write(`${cell('id', 36)} | ${cell('old', 60)} | ${cell('new', 70)} | from\n`);
  out.write(`${'-'.repeat(36)}-+-${'-'.repeat(60)}-+-${'-'.repeat(70)}-+-----\n`);
  for (const c of changes) out.write(`${cell(c.id, 36)} | ${cell(c.old, 60)} | ${cell(c.next, 70)} | ${c.from}\n`);
  out.write(`\n${changes.length} rows would change title (${unchanged} suspect rows left as they are).\n`);
  out.write(`Embeddings are not refreshed by this script: ${changes.length} rows would need re-embedding.\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await loadRows(since);
  const suspect = selectSuspect(rows);
  const todo = args.limit === null ? suspect : suspect.slice(0, args.limit);
  log.info({ since, inWindow: rows.length, suspect: suspect.length, toProcess: todo.length, apply: args.apply }, 'plan');

  const changes: Change[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < todo.length) {
      const { row, why } = todo[next++]!;
      try {
        const change = await resolveRow(row, why === 'shared');
        if (change) changes.push(change);
      } catch (err) {
        log.warn({ err, id: row.id }, 'row failed — left as is');
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  printTable(changes, todo.length - changes.length);

  if (!args.apply) return;

  const byId = new Map(todo.map(({ row }) => [row.id, row]));
  let updated = 0;
  for (const c of changes) {
    const rexMetadata = { ...(byId.get(c.id)?.rex_metadata ?? {}), title_source: c.titleSource };
    const { error } = await db.from('news_items').update({ title: c.next, rex_metadata: rexMetadata }).eq('id', c.id);
    if (error) {
      log.error({ id: c.id, err: error }, 'update failed');
      continue;
    }
    updated += 1;
  }
  log.info({ updated, of: changes.length }, 'titles updated');
}

main().catch((err) => {
  log.error({ err }, 'backfill failed');
  process.exit(1);
});
