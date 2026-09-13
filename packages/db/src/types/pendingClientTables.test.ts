import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The reminder that deletes `pendingClientTables.ts`.
 *
 * That file exists because the client-app migrations are written and not
 * applied, so the generated types cannot know about their tables yet. It is a
 * bridge, and bridges that nothing checks become second sources of truth — the
 * generated file and the hand-written one drift, and the hand-written one wins
 * at compile time while the database follows the other.
 *
 * So: the moment the generator catches up, this test fails and says what to do.
 */
const GENERATED = fileURLToPath(new URL('./database.ts', import.meta.url));

const BRIDGED_TABLES = [
  'client_accounts',
  'client_users',
  'client_disclosures',
  'client_invites',
  'compliance_documents',
  'company_profile',
  'commercial_relationships',
  'prepare_templates',
  'prepare_generations',
  'client_library_sections',
  'client_library_entries',
];

describe('the pending client tables bridge', () => {
  it('is still needed — delete it once the generator knows these tables', () => {
    const generated = readFileSync(GENERATED, 'utf8');

    const alreadyGenerated = BRIDGED_TABLES.filter((table) =>
      new RegExp(`^      ${table}: \\{$`, 'm').test(generated),
    );

    expect(
      alreadyGenerated,
      'These tables are now in the generated types, so the hand-written bridge in '
        + 'pendingClientTables.ts is a second source of truth for them. Remove them from '
        + 'PendingClientTables (and the whole file, if that empties it), and point '
        + 'ClientDatabase at Database.',
    ).toEqual([]);
  });

  it('names every table the client migrations create', () => {
    // Guards the other direction: a migration adding a client table without a
    // bridge entry would fail to typecheck in apps/client with an error that
    // points at a query rather than at this file.
    expect(BRIDGED_TABLES).toHaveLength(11);
  });
});
