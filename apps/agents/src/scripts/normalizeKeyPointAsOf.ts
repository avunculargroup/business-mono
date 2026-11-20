import { writeFileSync } from 'node:fs';
import { supabase } from '@platform/db';
import { emptyAsOfTally, normalizeRowAsOf, tallyAsOf } from '../lib/keyPointBackfill.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('backfill:key-point-asof');

/**
 * Applies the asOf rule extraction now follows to stored key_points, without
 * re-extracting anything: a `new` point's asOf becomes the Melbourne date of
 * the item's published_at; a background/opinion asOf that is not a valid
 * YYYY[-MM[-DD]], or is later than published_at, becomes null. Text and kind
 * are never touched. See normalizeRowAsOf.
 *
 * Dry run by default: counts the rows and points it would change and exits.
 * --apply writes every changed row's current key_points to a rollback file
 * first, then updates key_points only.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No model key — no LLM.
 *
 *   pnpm --filter @platform/agents backfill:key-point-asof [--days 30]
 *   pnpm --filter @platform/agents backfill:key-point-asof --apply [--days 30] [--out /tmp/asof-rollback.json]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGE = 500;

interface Row {
  id: string;
  published_at: string | null;
  key_points: unknown;
}

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    days: Number(value('--days') ?? 30),
    out: value('--out') ?? `/tmp/key-point-asof-rollback-${Date.now()}.json`,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();

  const tally = emptyAsOfTally();
  const todo: Array<{ id: string; before: unknown; after: unknown[] }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('news_items')
      .select('id, published_at, key_points')
      .gte('fetched_at', since)
      .order('fetched_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`news_items read failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      const { keyPoints, changes } = normalizeRowAsOf(r.key_points, r.published_at);
      tallyAsOf(changes, Array.isArray(r.key_points) ? r.key_points.length : 0, tally);
      if (changes.length > 0) todo.push({ id: r.id, before: r.key_points, after: keyPoints });
    }
    if (rows.length < PAGE) break;
  }

  log.info({ since, ...tally, apply: args.apply }, 'plan');
  if (!args.apply) return;

  writeFileSync(args.out, JSON.stringify(todo.map((r) => ({ id: r.id, key_points: r.before })), null, 2));
  log.info({ out: args.out, rows: todo.length }, 'rollback file written');

  let updated = 0;
  let failed = 0;
  for (const r of todo) {
    const { error } = await db.from('news_items').update({ key_points: r.after }).eq('id', r.id);
    if (error) {
      failed += 1;
      log.error({ id: r.id, err: error }, 'update failed');
      continue;
    }
    updated += 1;
    if (updated % 200 === 0) log.info({ updated, failed, of: todo.length }, 'progress');
  }
  log.info({ updated, failed, rollback: args.out }, 'done');
}

main().then(
  () => process.exit(0),
  (err) => {
    log.error({ err }, 'backfill failed');
    process.exit(1);
  },
);
