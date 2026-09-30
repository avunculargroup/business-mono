import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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
 * Every statement is ON CONFLICT ... DO NOTHING, and child rows resolve their
 * company by slug rather than by UUID, so the file is safe to re-run and
 * produces no diff churn from regenerated ids.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx packages/db/src/seeds/dump-register-seed.ts --slugs strategy,metaplanet
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

// --- Table shapes ------------------------------------------------------
//
// Column lists are explicit rather than SELECT *, so a schema change surfaces
// here as a missing column in the emitted SQL rather than as silently dropped
// data. When a migration adds a column to one of these tables, add it here.

const COMPANY_COLUMNS = [
  'slug', 'legal_name', 'jurisdiction', 'operational_hq',
  'primary_archetype', 'self_described_archetype',
  'reporting_standard', 'functional_currency', 'presentation_currency',
  'financial_year_end', 'tier', 'expected_disclosure_cadence',
  'market_cap_band', 'funding_source', 'acn', 'abn', 'arbn', 'isin', 'lei',
  'curator_notes', 'last_verified_at',
] as const;

interface ChildTable {
  table: string;
  columns: string[];
  /** Columns forming the ON CONFLICT target, excluding company_id. */
  conflict: string[];
  /** Column to sort by, for a stable diff between runs. */
  orderBy: string;
}

const CHILD_TABLES: ChildTable[] = [
  {
    table: 'company_former_names',
    columns: ['name', 'used_from', 'used_to', 'note'],
    conflict: ['name'],
    orderBy: 'name',
  },
  {
    table: 'company_listings',
    columns: ['venue', 'ticker', 'listing_type', 'filing_entity', 'listed_from', 'listed_to', 'note'],
    conflict: ['venue', 'ticker'],
    orderBy: 'ticker',
  },
  {
    table: 'research_documents',
    columns: [
      'document_type', 'source_class', 'title', 'venue', 'announcement_id',
      'pdf_url', 'published_at', 'filing_entity', 'is_audited',
      'retrieved_at', 'retrieval_error',
    ],
    conflict: ['venue', 'announcement_id'],
    orderBy: 'announcement_id',
  },
  {
    table: 'research_company_facts',
    columns: ['field_key', 'label', 'value', 'as_of', 'natural_key'],
    conflict: ['natural_key'],
    orderBy: 'natural_key',
  },
  {
    table: 'treasury_events',
    columns: [
      'event_type', 'event_date', 'quantity', 'consideration_native',
      'native_currency', 'fees_included', 'headline', 'detail',
      'disclosure_venue', 'filing_entity', 'basis', 'natural_key',
    ],
    conflict: ['natural_key'],
    orderBy: 'natural_key',
  },
  {
    table: 'treasury_holdings_snapshots',
    columns: ['as_of_date', 'quantity', 'value_native', 'native_currency', 'basis', 'natural_key'],
    conflict: ['natural_key'],
    orderBy: 'natural_key',
  },
  {
    table: 'research_findings',
    columns: [
      'finding_type', 'is_absence', 'subject', 'occurred_on',
      'headline', 'detail', 'materiality', 'natural_key',
    ],
    conflict: ['natural_key'],
    orderBy: 'natural_key',
  },
];

/**
 * Tables whose rows point at a research_documents row. The reference is
 * emitted as a sub-select on (venue, announcement_id) so the seed does not
 * carry document UUIDs, which differ per environment.
 */
const DOCUMENT_REF_TABLES = new Set([
  'research_company_facts',
  'treasury_events',
  'treasury_holdings_snapshots',
  'research_findings',
]);

// --- SQL literals ------------------------------------------------------

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  if (Array.isArray(value)) {
    if (value.length === 0) return "'{}'";
    const items = value.map((v) => String(v).replace(/(["\\])/g, '\\$1'));
    return dollarQuote(`{${items.map((i) => `"${i}"`).join(',')}}`);
  }

  if (typeof value === 'object') return dollarQuote(JSON.stringify(value));

  return dollarQuote(String(value));
}

/**
 * Curator notes run to several paragraphs and contain apostrophes, quotes and
 * occasional dollar signs. Dollar quoting avoids escaping them; the tag is
 * varied until it does not occur in the body.
 */
function dollarQuote(text: string): string {
  if (!/['\\]/.test(text) && !text.includes('\n')) return `'${text}'`;
  let tag = 'q';
  while (text.includes(`$${tag}$`)) tag += 'q';
  return `$${tag}$${text}$${tag}$`;
}

function companyIdSubquery(slug: string): string {
  return `(SELECT id FROM research_companies WHERE slug = ${sqlLiteral(slug)})`;
}

function documentIdSubquery(slug: string, venue: string, announcementId: string): string {
  return [
    '(SELECT id FROM research_documents WHERE company_id = ',
    companyIdSubquery(slug),
    ` AND venue = ${sqlLiteral(venue)}`,
    ` AND announcement_id = ${sqlLiteral(announcementId)})`,
  ].join('');
}

// --- Emit --------------------------------------------------------------

interface DocumentRow {
  id: string;
  venue: string;
  announcement_id: string;
  [key: string]: unknown;
}

function emitCompany(company: Record<string, unknown>): string {
  const values = COMPANY_COLUMNS.map((c) => sqlLiteral(company[c]));
  return [
    `INSERT INTO research_companies (`,
    `  ${COMPANY_COLUMNS.join(', ')}, is_published`,
    `) VALUES (`,
    `  ${values.join(',\n  ')},`,
    `  FALSE`,
    `)`,
    `ON CONFLICT (slug) DO NOTHING;`,
  ].join('\n');
}

function emitChildRows(
  slug: string,
  spec: ChildTable,
  rows: Record<string, unknown>[],
  documentsById: Map<string, DocumentRow>,
): string {
  if (rows.length === 0) return '';

  const usesDocumentRef = DOCUMENT_REF_TABLES.has(spec.table);
  const columns = ['company_id', ...spec.columns, ...(usesDocumentRef ? ['source_document_id'] : [])];

  const statements = rows.map((row) => {
    const values = [companyIdSubquery(slug), ...spec.columns.map((c) => sqlLiteral(row[c]))];

    if (usesDocumentRef) {
      const docId = row['source_document_id'] as string | null;
      const doc = docId ? documentsById.get(docId) : undefined;
      if (docId && !doc) {
        // A row sourced to a document outside this dump would silently become
        // NULL and fail the source gate on replay. Fail loudly instead.
        throw new Error(
          `${spec.table} row ${String(row[spec.conflict[0] as string])} references document ${docId}, ` +
            `which is not among ${slug}'s documents. Dump the owning record too, or fix the row.`,
        );
      }
      values.push(doc ? documentIdSubquery(slug, doc.venue, doc.announcement_id) : 'NULL');
    }

    return [
      `INSERT INTO ${spec.table} (${columns.join(', ')})`,
      `VALUES (`,
      `  ${values.join(',\n  ')}`,
      `)`,
      `ON CONFLICT (company_id, ${spec.conflict.join(', ')}) DO NOTHING;`,
    ].join('\n');
  });

  return `-- ${spec.table} (${rows.length})\n${statements.join('\n\n')}`;
}

// --- Main --------------------------------------------------------------

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

  const sections: string[] = [];
  const summary: string[] = [];

  for (const company of companies) {
    const slug = company['slug'] as string;
    const companyId = company['id'] as string;

    const { data: documents, error: docError } = await supabase
      .from('research_documents')
      .select('*')
      .eq('company_id', companyId)
      .order('announcement_id');
    if (docError) throw new Error(`Failed to read documents for ${slug}: ${docError.message}`);

    const documentsById = new Map<string, DocumentRow>(
      (documents ?? []).map((d) => [d['id'] as string, d as DocumentRow]),
    );

    const parts: string[] = [
      `-- ============================================================`,
      `-- ${String(company['legal_name'])} (${slug})`,
      `-- Last verified: ${String(company['last_verified_at'] ?? 'not recorded')}`,
      `-- ============================================================`,
      '',
      emitCompany(company),
    ];

    const counts: string[] = [];

    for (const spec of CHILD_TABLES) {
      const rows =
        spec.table === 'research_documents'
          ? (documents ?? [])
          : await readChildRows(spec, companyId, slug);

      if (rows.length === 0) continue;

      const sql = emitChildRows(slug, spec, rows as Record<string, unknown>[], documentsById);
      if (sql) parts.push('', sql);
      counts.push(`${rows.length} ${spec.table.replace('research_', '').replace('treasury_', '')}`);
    }

    sections.push(parts.join('\n'));
    summary.push(`--   ${slug}: ${counts.join(', ') || 'company row only'}`);
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `${stamp}_seed_${migrationName}.sql`;

  const header = [
    '-- ============================================================',
    `-- CORPORATE HOLDINGS — register records, generated`,
    '--',
    `-- Generated by packages/db/src/seeds/dump-register-seed.ts`,
    `-- from the live database on ${new Date().toISOString().slice(0, 10)}.`,
    '--',
    '-- Records in this file:',
    ...summary,
    '--',
    '-- Idempotent: every statement is ON CONFLICT ... DO NOTHING, and child',
    '-- rows resolve their company and source document by natural key rather',
    '-- than by UUID, so ids differ freely between environments.',
    '--',
    '-- Records land with is_published = FALSE and no clearance. Visibility is',
    '-- promoted in the target environment, not baked into the seed.',
    '--',
    '-- Document full_text is not included; it is re-fetchable and large.',
    '-- ============================================================',
    '',
  ].join('\n');

  const sql = `${header}\n${sections.join('\n\n')}\n`;

  if (toStdout) {
    process.stdout.write(sql);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, filename);
  writeFileSync(path, sql, 'utf-8');

  console.log(`Wrote ${path}`);
  console.log(summary.join('\n').replace(/^--\s+/gm, '  '));
}

async function readChildRows(
  spec: ChildTable,
  companyId: string,
  slug: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from(spec.table)
    .select('*')
    .eq('company_id', companyId)
    .order(spec.orderBy);

  if (error) throw new Error(`Failed to read ${spec.table} for ${slug}: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
