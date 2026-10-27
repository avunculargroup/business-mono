import { writeFileSync } from 'node:fs';
import { supabase } from '@platform/db';
import { extractNewsMetadata } from '../workflows/newsExtract.js';
import { BACKFILL_CONTENT_CHARS, hasLegacyKeyPoints, tallyKinds, type KindTally } from '../lib/keyPointBackfill.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill:key-point-kinds');

/**
 * Re-extracts news_items.key_points as { text, kind, asOf } for recent rows
 * still holding pre-kind bare strings, so the digest's new-only filter and the
 * social-post labels apply to them. Only key_points is written — summary,
 * category and tags stay as they are.
 *
 * Dry run by default: counts the rows it would touch and exits. --apply writes
 * every touched row's current key_points to a rollback file before changing
 * anything. A row whose re-extraction fails is left as it was (legacy strings
 * read as `new`, i.e. the old behaviour).
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the extractor's model key.
 *
 *   pnpm --filter @platform/agents backfill:key-point-kinds [--days 14]
 *   pnpm --filter @platform/agents backfill:key-point-kinds --apply [--days 14] [--limit N] [--out /tmp/kp-rollback.json]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGE = 500;
const CONCURRENCY = 4;

interface Args {
  apply: boolean;
  days: number;
  limit: number | null;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    days: Number(value('--days') ?? 14),
    limit: value('--limit') ? Number(value('--limit')) : null,
    out: value('--out') ?? `/tmp/key-point-backfill-rollback-${Date.now()}.json`,
  };
}

interface Row {
  id: string;
  title: string;
  source_name: string | null;
  body_markdown: string | null;
  key_points: unknown;
}

async function loadRows(since: string): Promise<{ inWindow: number; legacy: Row[] }> {
  let inWindow = 0;
  const legacy: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('news_items')
      .select('id, title, source_name, body_markdown, key_points')
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`news_items read failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    inWindow += rows.length;
    for (const r of rows) if (hasLegacyKeyPoints(r.key_points) && r.body_markdown) legacy.push(r);
    if (rows.length < PAGE) break;
  }
  return { inWindow, legacy };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
  const { inWindow, legacy } = await loadRows(since);
  const todo = args.limit === null ? legacy : legacy.slice(0, args.limit);

  log.info({ since, inWindow, legacy: legacy.length, toProcess: todo.length, apply: args.apply }, 'plan');
  if (!args.apply) return;

  writeFileSync(args.out, JSON.stringify(todo.map((r) => ({ id: r.id, key_points: r.key_points })), null, 2));
  log.info({ out: args.out, rows: todo.length }, 'rollback file written');

  let updated = 0;
  let failed = 0;
  const kinds: KindTally = { new: 0, background: 0, opinion: 0 };

  let next = 0;
  async function worker(): Promise<void> {
    while (next < todo.length) {
      const row = todo[next++]!;
      const { data, reason } = await extractNewsMetadata({
        title: row.title,
        source: row.source_name ?? 'News',
        content: row.body_markdown!.slice(0, BACKFILL_CONTENT_CHARS),
      });
      if (!data) {
        failed += 1;
        log.warn({ id: row.id, reason }, 're-extraction failed — row left as is');
        continue;
      }
      const { error } = await db.from('news_items').update({ key_points: data.key_points }).eq('id', row.id);
      if (error) {
        failed += 1;
        log.error({ id: row.id, err: error }, 'update failed');
        continue;
      }
      updated += 1;
      tallyKinds(data.key_points, kinds);
      if (updated % 50 === 0) log.info({ updated, failed, of: todo.length }, 'progress');
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  log.info({ updated, failed, kinds, rollback: args.out }, 'done');
}

main().then(
  () => process.exit(0),
  (err) => {
    log.error({ err }, 'backfill failed');
    process.exit(1);
  },
);
