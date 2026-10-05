/**
 * Pure SQL emitter for corporate-holdings register records. The CLI in
 * `dump-register-seed.ts` reads the rows; this module turns them into an
 * idempotent seed migration and has no database client, so it can be tested.
 *
 * Every statement is `INSERT ... SELECT ... WHERE NOT EXISTS` keyed on the
 * row's natural identity, compared with `IS NOT DISTINCT FROM` so a NULL in a
 * key column (most listings have no `listed_from`) still matches. The same
 * pattern as `20260911000000_seed_digitalx_and_block.sql`. Replayed against the
 * database the records were dumped from, every statement is a no-op.
 *
 * Child rows resolve their company, source document and linked event by
 * natural key rather than UUID, so ids differ freely between environments.
 */

export type Row = Record<string, unknown>;

type RefKind = 'document' | 'section' | 'event';

export interface TableSpec {
  table: string;
  /** Copied verbatim. */
  columns: readonly string[];
  /** Columns forming the row's identity within its company. */
  key: readonly string[];
  /** Column to sort by, for a stable diff between runs. */
  orderBy: string;
  /** UUID columns re-expressed as a lookup on the target's natural key. */
  refs?: Readonly<Record<string, RefKind>>;
  /**
   * Columns deliberately not dumped. Anything in a row that is in none of
   * `columns`, `refs` or `ignored` throws, so a migration that adds a column
   * surfaces here instead of being silently dropped from the seed.
   */
  ignored: readonly string[];
}

export const COMPANY_SPEC = {
  columns: [
    'slug', 'legal_name', 'jurisdiction', 'jurisdiction_basis', 'operational_hq',
    'primary_archetype', 'self_described_archetype',
    'reporting_standard', 'functional_currency', 'presentation_currency',
    'financial_year_end', 'fiscal_calendar_type', 'tier', 'expected_disclosure_cadence',
    'market_cap_band', 'funding_source', 'cost_basis_convention',
    'holding_status', 'exited_on', 'ledger_absence_reason',
    'curator_notes', 'last_verified_at',
  ],
  // Visibility is an environment decision, not a property of the research:
  // seeded records land as drafts, unreviewed and uncleared.
  ignored: [
    'id', 'review_state', 'reviewed_by', 'reviewed_at',
    'content_updated_at', 'changed_since_review',
    'client_cleared', 'client_cleared_by', 'client_cleared_at', 'client_summary',
    'created_by', 'created_at', 'updated_at',
  ],
} as const;

const ROW_AUDIT = ['id', 'company_id', 'created_at'] as const;
/**
 * Review state is an environment decision, like the record's: seeded rows land
 * as drafts (the column default) and are reviewed where they land.
 */
const ROW_REVIEW = [
  'review_state', 'reviewed_by', 'reviewed_at', 'content_updated_at', 'changed_since_review',
] as const;

/** In dependency order: documents before anything sourced to them, events before findings. */
export const CHILD_TABLES: readonly TableSpec[] = [
  {
    table: 'company_former_names',
    columns: ['name', 'used_from', 'used_to', 'note'],
    key: ['name'],
    orderBy: 'name',
    ignored: ['id', 'company_id'],
  },
  {
    table: 'company_identifiers',
    columns: ['scheme', 'value', 'valid_from', 'valid_to', 'note'],
    key: ['scheme', 'value'],
    orderBy: 'scheme',
    ignored: [...ROW_AUDIT],
  },
  {
    table: 'company_listings',
    columns: [
      'venue', 'ticker', 'listing_type', 'security_class', 'filing_entity',
      'listed_from', 'listed_to', 'note',
    ],
    key: ['venue', 'ticker', 'listed_from'],
    orderBy: 'ticker',
    ignored: ['id', 'company_id'],
  },
  {
    table: 'research_documents',
    columns: [
      'document_type', 'source_class', 'title', 'venue', 'announcement_id',
      'pdf_url', 'published_at', 'filing_entity', 'is_audited',
      'retrieved_at', 'retrieval_error', 'resolution_status',
    ],
    key: ['venue', 'announcement_id'],
    orderBy: 'announcement_id',
    // The body is large and re-fetchable. Its hash and page count describe a
    // body the seed does not carry, so the ingest re-fetches from scratch.
    ignored: [...ROW_AUDIT, 'full_text', 'content_sha256', 'page_count'],
  },
  {
    table: 'research_company_facts',
    columns: ['field_key', 'label', 'value', 'as_of', 'is_superseded', 'natural_key'],
    key: ['natural_key'],
    orderBy: 'natural_key',
    refs: { source_document_id: 'document', source_section_id: 'section' },
    // superseded_by is checked in emitChildRows: a self-reference would need
    // ordering this emitter does not do, and no record uses it yet.
    ignored: [...ROW_AUDIT, ...ROW_REVIEW, 'updated_at', 'superseded_by'],
  },
  {
    table: 'treasury_events',
    columns: [
      'event_type', 'asset_class', 'event_date', 'quantity', 'consideration_native',
      'native_currency', 'fees_included', 'headline', 'detail',
      'disclosure_venue', 'filing_entity', 'basis', 'natural_key',
    ],
    key: ['natural_key'],
    orderBy: 'natural_key',
    refs: { source_document_id: 'document', source_section_id: 'section' },
    ignored: [...ROW_AUDIT, ...ROW_REVIEW, 'updated_at'],
  },
  {
    table: 'treasury_holdings_snapshots',
    columns: [
      'as_of_date', 'asset', 'instrument_type', 'quantity', 'basis',
      'look_through_btc_equivalent', 'is_related_party_vehicle', 'includes_customer_assets',
      'encumbered_quantity', 'encumbrance_counterparty', 'encumbrance_obligation',
      'value_native', 'native_currency', 'natural_key',
    ],
    key: ['natural_key'],
    orderBy: 'natural_key',
    refs: { source_document_id: 'document', source_section_id: 'section' },
    ignored: [...ROW_AUDIT],
  },
  {
    table: 'research_findings',
    columns: [
      'finding_type', 'is_absence', 'subject', 'occurred_on',
      'headline', 'detail', 'materiality', 'is_suppressed', 'suppressed_reason', 'natural_key',
    ],
    key: ['natural_key'],
    orderBy: 'natural_key',
    refs: { source_document_id: 'document', event_id: 'event' },
    ignored: [...ROW_AUDIT, ...ROW_REVIEW],
  },
  {
    table: 'secondary_claims',
    columns: [
      'source_name', 'source_url', 'claimed_quantity', 'claimed_as_of', 'observed_at', 'note',
    ],
    key: ['source_name', 'observed_at'],
    orderBy: 'observed_at',
    ignored: [...ROW_AUDIT],
  },
];

/**
 * Sections belong to a document, not a company, so they sit outside
 * CHILD_TABLES and are emitted straight after the documents they split.
 */
export const SECTION_SPEC = {
  table: 'research_document_sections',
  columns: ['filing_item', 'source_class', 'is_filed', 'notes'],
  ignored: ['id', 'document_id', 'created_at'],
} as const;

// --- SQL literals ------------------------------------------------------

export function sqlLiteral(value: unknown): string {
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

function keyMatch(key: readonly string[], row: Row): string {
  return key.map((c) => `${c} IS NOT DISTINCT FROM ${sqlLiteral(row[c])}`).join(' AND ');
}

function documentSubquery(slug: string, doc: Row): string {
  return `(SELECT id FROM research_documents WHERE company_id = ${companyIdSubquery(slug)} AND ${keyMatch(['venue', 'announcement_id'], doc)})`;
}

interface Lookups {
  documents: Map<string, Row>;
  sections: Map<string, Row>;
  events: Map<string, Row>;
}

function refSubquery(slug: string, kind: RefKind, target: Row, lookups: Lookups): string {
  if (kind === 'document') return documentSubquery(slug, target);
  if (kind === 'section') {
    const doc = lookups.documents.get(target['document_id'] as string);
    if (!doc) throw new Error(`Section ${String(target['filing_item'])} belongs to a document outside ${slug}.`);
    return `(SELECT id FROM research_document_sections WHERE document_id = ${documentSubquery(slug, doc)} AND filing_item = ${sqlLiteral(target['filing_item'])})`;
  }
  return `(SELECT id FROM treasury_events WHERE company_id = ${companyIdSubquery(slug)} AND natural_key = ${sqlLiteral(target['natural_key'])})`;
}

function assertKnownColumns(table: string, row: Row, known: readonly string[]): void {
  const allowed = new Set(known);
  const unknown = Object.keys(row).filter((c) => !allowed.has(c));
  if (unknown.length > 0) {
    throw new Error(
      `${table} has column(s) the seed does not know about: ${unknown.join(', ')}. ` +
        'Add each to columns (dumped) or ignored (deliberately not) in registerSeed.ts.',
    );
  }
}

// --- Emit --------------------------------------------------------------

export interface RecordDump {
  company: Row;
  /** Rows per child table name, as read (all columns). */
  children: Record<string, Row[]>;
  /** Sections of this record's documents. */
  sections?: Row[];
}

export function emitCompany(company: Row): string {
  assertKnownColumns('research_companies', company, [...COMPANY_SPEC.columns, ...COMPANY_SPEC.ignored]);
  const values = COMPANY_SPEC.columns.map((c) => sqlLiteral(company[c]));
  return [
    `INSERT INTO research_companies (${COMPANY_SPEC.columns.join(', ')}, review_state)`,
    `SELECT`,
    `  ${values.join(',\n  ')},`,
    `  'draft'`,
    `WHERE NOT EXISTS (SELECT 1 FROM research_companies WHERE slug = ${sqlLiteral(company['slug'])});`,
  ].join('\n');
}

export function emitSections(slug: string, sections: Row[], documents: Map<string, Row>): string {
  if (sections.length === 0) return '';
  const statements = sections.map((row) => {
    assertKnownColumns(SECTION_SPEC.table, row, [...SECTION_SPEC.columns, ...SECTION_SPEC.ignored]);
    const doc = documents.get(row['document_id'] as string);
    if (!doc) throw new Error(`Section ${String(row['filing_item'])} belongs to a document outside ${slug}.`);
    const docRef = documentSubquery(slug, doc);
    return [
      `INSERT INTO ${SECTION_SPEC.table} (document_id, ${SECTION_SPEC.columns.join(', ')})`,
      `SELECT`,
      `  ${[docRef, ...SECTION_SPEC.columns.map((c) => sqlLiteral(row[c]))].join(',\n  ')}`,
      `WHERE NOT EXISTS (`,
      `  SELECT 1 FROM ${SECTION_SPEC.table} WHERE document_id = ${docRef}`,
      `    AND filing_item = ${sqlLiteral(row['filing_item'])}`,
      `);`,
    ].join('\n');
  });
  return `-- ${SECTION_SPEC.table} (${sections.length})\n${statements.join('\n\n')}`;
}

export function emitChildRows(
  slug: string,
  spec: TableSpec,
  rows: Row[],
  lookups: Lookups,
): string {
  if (rows.length === 0) return '';
  const refColumns = Object.keys(spec.refs ?? {});
  const columns = ['company_id', ...spec.columns, ...refColumns];

  const statements = rows.map((row) => {
    assertKnownColumns(spec.table, row, [...spec.columns, ...refColumns, ...spec.ignored]);
    if (spec.table === 'research_company_facts' && row['superseded_by'] != null) {
      throw new Error(`research_company_facts ${String(row['natural_key'])} has superseded_by set, which the seed cannot express yet.`);
    }

    const values = [companyIdSubquery(slug), ...spec.columns.map((c) => sqlLiteral(row[c]))];

    for (const [column, kind] of Object.entries(spec.refs ?? {})) {
      const id = row[column] as string | null | undefined;
      if (id == null) {
        values.push('NULL');
        continue;
      }
      const target = { document: lookups.documents, section: lookups.sections, event: lookups.events }[kind].get(id);
      if (!target) {
        // A reference outside this record would silently become NULL and
        // fail the source gate on replay. Fail loudly instead.
        throw new Error(
          `${spec.table} ${String(row[spec.key[0] as string])} references ${kind} ${id}, ` +
            `which is not among ${slug}'s rows. Dump the owning record too, or fix the row.`,
        );
      }
      values.push(refSubquery(slug, kind, target, lookups));
    }

    return [
      `INSERT INTO ${spec.table} (${columns.join(', ')})`,
      `SELECT`,
      `  ${values.join(',\n  ')}`,
      `WHERE NOT EXISTS (`,
      `  SELECT 1 FROM ${spec.table} WHERE company_id = ${companyIdSubquery(slug)}`,
      `    AND ${keyMatch(spec.key, row)}`,
      `);`,
    ].join('\n');
  });

  return `-- ${spec.table} (${rows.length})\n${statements.join('\n\n')}`;
}

function byId(rows: Row[] | undefined): Map<string, Row> {
  return new Map((rows ?? []).map((r) => [r['id'] as string, r]));
}

export function emitRecord(dump: RecordDump): { sql: string; summary: string } {
  const slug = dump.company['slug'] as string;
  const lookups: Lookups = {
    documents: byId(dump.children['research_documents']),
    sections: byId(dump.sections),
    events: byId(dump.children['treasury_events']),
  };

  const parts: string[] = [
    `-- ============================================================`,
    `-- ${String(dump.company['legal_name'])} (${slug})`,
    `-- Last verified: ${String(dump.company['last_verified_at'] ?? 'not recorded')}`,
    `-- ============================================================`,
    '',
    emitCompany(dump.company),
  ];
  const counts: string[] = [];

  for (const spec of CHILD_TABLES) {
    const rows = [...(dump.children[spec.table] ?? [])].sort((a, b) =>
      String(a[spec.orderBy] ?? '').localeCompare(String(b[spec.orderBy] ?? '')),
    );
    if (rows.length === 0) continue;
    parts.push('', emitChildRows(slug, spec, rows, lookups));
    counts.push(`${rows.length} ${spec.table.replace('research_', '').replace('treasury_', '')}`);

    if (spec.table === 'research_documents' && dump.sections?.length) {
      const sections = [...dump.sections].sort((a, b) =>
        `${String(a['document_id'])}|${String(a['filing_item'])}`.localeCompare(`${String(b['document_id'])}|${String(b['filing_item'])}`),
      );
      parts.push('', emitSections(slug, sections, lookups.documents));
      counts.push(`${sections.length} document_sections`);
    }
  }

  return { sql: parts.join('\n'), summary: `--   ${slug}: ${counts.join(', ') || 'company row only'}` };
}

export function emitMigration(dumps: RecordDump[], generatedOn: string): string {
  const records = dumps.map(emitRecord);
  const header = [
    '-- ============================================================',
    '-- CORPORATE HOLDINGS — register records, generated',
    '--',
    '-- Generated by packages/db/src/seeds/dump-register-seed.ts',
    `-- from the live database on ${generatedOn}.`,
    '--',
    '-- Records in this file:',
    ...records.map((r) => r.summary),
    '--',
    '-- Idempotent: every statement is INSERT ... WHERE NOT EXISTS on the',
    '-- row\'s natural key, and child rows resolve their company, source',
    '-- document and event by natural key rather than by UUID, so ids differ',
    '-- freely between environments. Against the database these were dumped',
    '-- from, the whole file is a no-op.',
    '--',
    '-- Records land as review_state = \'draft\' with no clearance. Review and',
    '-- clearance happen in the target environment, not baked into the seed.',
    '--',
    '-- Document full_text is not included; it is re-fetchable and large.',
    '-- ============================================================',
    '',
  ].join('\n');
  return `${header}\n${records.map((r) => r.sql).join('\n\n')}\n`;
}
