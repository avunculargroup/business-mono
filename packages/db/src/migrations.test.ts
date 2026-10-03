import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

/**
 * Every view runs as the caller.
 *
 * A view without `security_invoker` reads its tables with its owner's
 * privileges, past RLS, and Supabase's default grants give `anon` SELECT on
 * it. Until 20261003010000 that was all 33 views, and the anon key in the
 * browser bundle could read the CRM through /rest/v1/.
 *
 * `CREATE OR REPLACE VIEW` resets a view's options, so the fix is undone by
 * the next migration that redefines a view without restating it. This replays
 * the migrations in order and checks the state each view ends in.
 *
 * It replays filenames, not what the database applied. A migration merged
 * later with an earlier timestamp is applied after the ones it sorts before,
 * so a view it redefines can end up definer on live while this passes — give
 * a view-redefining migration a timestamp later than everything on main.
 */
describe('views', () => {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  /** Comments out, so a commented-out statement is not replayed. */
  const sql = (file: string) =>
    readFileSync(`${MIGRATIONS}/${file}`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '');

  const NAME = String.raw`(?:public\.)?"?(\w+)"?`;
  const STATEMENTS = new RegExp(
    [
      String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s*(?:\(([^)]*)\)\s*)?(?:WITH\s*\(([^)]*)\)\s*)?AS\b`,
      String.raw`ALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}\s+SET\s*\(([^)]*)\)`,
      String.raw`DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?${NAME}`,
    ].join('|'),
    'gi',
  );
  const INVOKER = /security_invoker\s*=\s*(?:true|on)/i;

  /** View name → whether it currently runs as the caller. */
  function replay(): Map<string, boolean> {
    const views = new Map<string, boolean>();
    for (const file of files) {
      for (const match of sql(file).matchAll(STATEMENTS)) {
        const [, created, , createdWith, altered, alteredSet, dropped] = match;
        if (created) views.set(created.toLowerCase(), INVOKER.test(createdWith ?? ''));
        else if (altered && INVOKER.test(alteredSet ?? '')) views.set(altered.toLowerCase(), true);
        else if (dropped) views.delete(dropped.toLowerCase());
      }
    }
    return views;
  }

  it('finds the views, so the case below asserts something', () => {
    // 33 when this was written. Fewer means the parser stopped matching.
    expect(replay().size).toBeGreaterThanOrEqual(33);
  });

  it('leaves no view running as its owner', () => {
    const definer = [...replay()].filter(([, invoker]) => !invoker).map(([name]) => name);

    expect(
      definer,
      'These views read past RLS, and anon can select them. Create or redefine them '
        + 'WITH (security_invoker = true) — CREATE OR REPLACE VIEW drops the option.',
    ).toEqual([]);
  });

  it('treats a redefinition as undoing the option, as Postgres does', () => {
    // The parser's own rule, checked on a synthetic sequence.
    const statements = [
      'CREATE VIEW v_x AS SELECT 1;',
      'ALTER VIEW v_x SET (security_invoker = true);',
      'CREATE OR REPLACE VIEW v_x AS SELECT 2;',
    ].join('\n');
    const states = [...statements.matchAll(STATEMENTS)].map((m) =>
      m[1] ? INVOKER.test(m[3] ?? '') : m[4] ? INVOKER.test(m[5] ?? '') : null,
    );
    expect(states).toEqual([false, true, false]);
  });
});

/**
 * No security-definer function is callable by anon unless it has to be.
 *
 * Supabase grants EXECUTE on every new function in `public` to anon,
 * authenticated and service_role directly. `REVOKE … FROM PUBLIC` therefore
 * removes nothing, and two migrations relied on it: until 20261003020000 the
 * anon key could decrypt a stored LinkedIn token. A definer function runs past
 * RLS, so the grant is the only thing standing between it and the internet.
 *
 * Statically, then: every function a migration declares SECURITY DEFINER is
 * revoked from anon by name in some migration, or sits on the list below with
 * the reason it must stay callable.
 */
describe('security-definer functions', () => {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const all = files
    .map((file) =>
      readFileSync(`${MIGRATIONS}/${file}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, ''),
    )
    .join('\n');

  /** Callable by anon on purpose. Each needs its reason. */
  const ANON_CALLABLE: Record<string, string> = {
    is_team_member: 'RLS policies call it, and a policy runs as the querying role',
    current_client_account_id: 'RLS policies call it, and a policy runs as the querying role',
    client_invite_details: 'the invite page reads it before sign-in',
    redeem_client_invite: 'refuses any call without a signed-in session',
    assert_not_client_user: 'a trigger function; fails when called directly',
    assert_not_team_member: 'a trigger function; fails when called directly',
  };

  /** Names of functions any migration declares SECURITY DEFINER. */
  function definers(): string[] {
    const names = new Set<string>();
    const fn = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
    for (const match of all.matchAll(fn)) {
      // The header runs to the body's opening dollar quote.
      const rest = all.slice(match.index ?? 0);
      const header = rest.slice(0, rest.search(/\bAS\s+\$\w*\$/i));
      if (/SECURITY\s+DEFINER/i.test(header)) names.add(match[1].toLowerCase());
    }
    return [...names].sort();
  }

  function revokedFromAnon(name: string): boolean {
    const revoke = new RegExp(
      String.raw`REVOKE\s+(?:ALL|EXECUTE)[^;]*?ON\s+FUNCTION\s+(?:public\.)?"?${name}"?\s*\([^;]*?FROM\s+[^;]*\banon\b`,
      'i',
    );
    return revoke.test(all);
  }

  it('finds the security-definer functions, so the case below asserts something', () => {
    expect(definers()).toEqual(expect.arrayContaining(['social_credential_token', 'is_team_member']));
  });

  it('revokes every one from anon, or says why it stays callable', () => {
    const open = definers().filter((name) => !(name in ANON_CALLABLE) && !revokedFromAnon(name));

    expect(
      open,
      'These SECURITY DEFINER functions are still executable by anon. REVOKE … FROM PUBLIC does '
        + 'not remove Supabase\'s direct grant — revoke FROM anon by name, or add the function to '
        + 'ANON_CALLABLE with the reason it must stay callable.',
    ).toEqual([]);
  });
});

