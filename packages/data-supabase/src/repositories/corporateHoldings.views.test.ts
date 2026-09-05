import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The corporate holdings adapter reads views, and its fake client cannot see
 * them: `__setDataset` accepts whatever columns the fixture invents, so a
 * select naming a column the view does not project passes every mocked test
 * and fails in Postgres with 42703. That is how `v_company_position` shipped
 * without `source_document_id` — the one provenance view that omitted it — and
 * why the company page rendered its error boundary rather than the record.
 *
 * The migrations are the only offline description of the real views, so the
 * contract is asserted against them: each view the adapter reads provenance
 * from must project the whole block that `toProvenance` maps.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));

/** The columns `toProvenance` reads. `source_is_audited` is optional there. */
const PROVENANCE_COLUMNS = [
  'source_document_id',
  'source_title',
  'source_class',
  'source_url',
  'source_published_at',
] as const;

const PROVENANCE_VIEWS = [
  'v_research_ledger',
  'v_research_publishable',
  'v_company_position',
  'v_company_facts',
  'v_research_absences',
] as const;

/** Every migration, oldest first — the order `supabase db push` applies them. */
function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(`${MIGRATIONS_DIR}/${name}`, 'utf8'))
    .join('\n');
}

/**
 * The definition a view ends up with: its last CREATE in migration order, since
 * a later migration replaces an earlier one.
 */
function latestDefinition(sql: string, view: string): string {
  const pattern = new RegExp(`CREATE (?:OR REPLACE )?VIEW ${view} AS([\\s\\S]*?);\\s*$`, 'gm');
  const blocks = [...sql.matchAll(pattern)];
  expect(blocks.length, `no CREATE VIEW ${view} in supabase/migrations`).toBeGreaterThan(0);
  return blocks[blocks.length - 1][1];
}

/**
 * Just the projection list — everything before the view's own FROM.
 *
 * The join clauses have to be cut away or the check passes on the broken
 * definition: `v_company_position` joined `research_documents d ON d.id =
 * s.source_document_id` while projecting no document id at all, and a search
 * over the whole body finds that mention and reads it as a column.
 *
 * Depth-aware because a projection can parenthesise a FROM of its own; the
 * first one at depth zero is the view's.
 */
function projections(body: string): string {
  let depth = 0;

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '(') depth += 1;
    else if (body[i] === ')') depth -= 1;
    else if (depth === 0 && /\s/.test(body[i]) && /^FROM\s/i.test(body.slice(i + 1))) {
      return body.slice(0, i);
    }
  }

  throw new Error('view definition has no FROM at depth zero');
}

describe('provenance views', () => {
  const sql = allMigrations();

  it.each(PROVENANCE_VIEWS)('%s projects the provenance block', (view) => {
    let body = latestDefinition(sql, view);

    // v_research_publishable is `SELECT l.*` over the ledger view, so what it
    // projects is what the ledger view projects.
    if (/SELECT\s+l\.\*/.test(body)) body = latestDefinition(sql, 'v_research_ledger');

    const projected = projections(body);

    for (const column of PROVENANCE_COLUMNS) {
      // Either aliased (`d.id AS source_document_id`) or projected by name.
      expect(
        new RegExp(`(?:AS\\s+${column}\\b)|(?:\\b\\w+\\.${column}\\b)`).test(projected),
        `${view} does not project ${column}`,
      ).toBe(true);
    }
  });
});
