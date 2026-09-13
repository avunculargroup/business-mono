import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The migration ledger keys on the timestamp alone.
 *
 * `supabase_migrations.schema_migrations` has `version` — the leading 14 digits
 * — as its primary key. The filename after it is a label, not part of the
 * identity. So two migration files sharing a timestamp are one row as far as
 * the ledger is concerned, and pushing the second raises
 * `duplicate key value violates unique constraint "schema_migrations_pkey"`.
 *
 * That failure is worse than it sounds, and this test exists because it
 * happened. `db push` aborts on the offending file, and with `--include-all`
 * the offender can be the *first* in the batch — so a merge carrying seventeen
 * migrations applied none of them. CI was green, the merge was clean, and the
 * deploy went red in a workflow nobody was watching, so the schema simply did
 * not change.
 *
 * Two branches in flight pick timestamps independently, so this collides
 * whenever two people write a migration on the same day and round to the same
 * hour. Cheap to check, invisible until it is expensive.
 */
const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

describe('migration versions', () => {
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql'));

  it('finds the migrations, so the cases below assert something', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('gives every migration a unique timestamp', () => {
    const byVersion = new Map<string, string[]>();

    for (const file of files) {
      const version = /^(\d{14})_/.exec(file)?.[1];
      if (!version) continue;
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${names.join(' and ')}`);

    expect(
      collisions,
      'schema_migrations keys on the timestamp alone, so these are one row to the ledger. '
        + 'db push aborts on the duplicate and applies nothing after it — rename one, keeping '
        + 'any ordering the migrations depend on.',
    ).toEqual([]);
  });

  it('names every migration with a 14-digit timestamp', () => {
    // A file the CLI cannot version is a file it silently will not apply.
    expect(files.filter((file) => !/^\d{14}_.+\.sql$/.test(file))).toEqual([]);
  });
});
