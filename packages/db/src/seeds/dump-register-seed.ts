import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { CHILD_TABLES, emitMigration, type RecordDump, type Row } from './registerSeed.js';

/**
 * Dump corporate-holdings register records from the live database into an
 * idempotent seed migration.
 *
 * Records are researched by writing straight to the database — a migration
 * per record would slow discovery down while the schema is still moving. This
 * script closes the loop: once a batch of records has settled, it emits the
 * SQL that puts them in the repo, so a reset or a fresh branch reproduces
 * them and a reviewer can read what was added.
 *
 * The SQL itself comes from `registerSeed.ts`, which holds the column lists
 * and is tested; this file only reads rows and writes the migration.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --filter @platform/db seed:dump-register --slugs strategy,metaplanet
 *
 *   --slugs <a,b,c>   Records to dump. Omit to dump every record.
 *   --name <text>     Migration filename suffix. Defaults to "register_records".
 *   --out <dir>       Output directory. Defaults to supabase/migrations.
 *   --stdout          Print instead of writing a file.
 *
 * What it deliberately does NOT dump:
 *   - full_text on documents. It is large, re-fetchable, and would bloat the
 *     repo. Seeded documents land with their URL and no cached body.
 *   - review_state / client_cleared / client_cleared_by / client_cleared_at.
 *     Visibility is an environment decision, not a property of the research.
 *     Seeded records land unpublished and uncleared, and are promoted in the
 *     target environment.
 */

const SUPABASE_URL = process.env['SUPABASE_URL'] as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] as string;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- CLI ---------------------------------------------------------------

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const slugFilter = arg('--slugs')?.split(',').map((s) => s.trim()).filter(Boolean);
const migrationName = arg('--name') ?? 'register_records';
const toStdout = process.argv.includes('--stdout');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = arg('--out') ?? resolve(__dirname, '../../../../supabase/migrations');

// --- Main --------------------------------------------------------------

async function readRows(table: string, companyId: string, slug: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select('*').eq('company_id', companyId);
  if (error) throw new Error(`Failed to read ${table} for ${slug}: ${error.message}`);
  return (data ?? []) as Row[];
}

async function main(): Promise<void> {
  let query = supabase.from('research_companies').select('*').order('slug');
  if (slugFilter) query = query.in('slug', slugFilter);

  const { data: companies, error } = await query;
  if (error) throw new Error(`Failed to read research_companies: ${error.message}`);
  if (!companies || companies.length === 0) {
    throw new Error(slugFilter ? `No records matched: ${slugFilter.join(', ')}` : 'No records found');
  }

  if (slugFilter) {
    const found = new Set(companies.map((c) => c.slug as string));
    const missing = slugFilter.filter((s) => !found.has(s));
    if (missing.length > 0) throw new Error(`Unknown slugs: ${missing.join(', ')}`);
  }

  const dumps: RecordDump[] = [];
  for (const company of companies as Row[]) {
    const slug = company['slug'] as string;
    const children: Record<string, Row[]> = {};
    for (const spec of CHILD_TABLES) {
      children[spec.table] = await readRows(spec.table, company['id'] as string, slug);
    }
    dumps.push({ company, children });
  }

  const sql = emitMigration(dumps, new Date().toISOString().slice(0, 10));

  if (toStdout) {
    process.stdout.write(sql);
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `${stamp}_seed_${migrationName}.sql`);
  writeFileSync(path, sql, 'utf-8');

  console.log(`Wrote ${path}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
