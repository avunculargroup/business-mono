import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_READ_DOMAINS } from '@platform/data';

/**
 * What Minute cannot reach, and what says so.
 *
 * `apps/demo`'s boundary test asserts the demo cannot open a database
 * connection. This one asserts something different, because this app *does*
 * hold a database client: it asserts the app cannot reach the agent stack, and
 * — the part that matters — that it cannot reach the service role key, which
 * bypasses RLS and would make every policy in the hardening migration
 * decorative.
 *
 * Structural rather than behavioural. There is no runtime guard; the app simply
 * does not depend on anything that could do these things. That is a strong
 * property and an easy one to lose to a single `pnpm add`, because nothing
 * would fail. So the dependency graph is asserted.
 */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * `@platform/signal` would let the app message a director; `@platform/voice`
 * and `@mastra/core` would let it run inference at request time. All three
 * contradict *deterministic before LLM*: by the time a subscriber opens a page,
 * the agent work is done and committed.
 */
const FORBIDDEN = ['@platform/signal', '@platform/voice', '@mastra/core', '@platform/agents'];

function manifest(pkgPath: string): { dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(`${WORKSPACE_ROOT}${pkgPath}/package.json`, 'utf8'));
}

/** Runtime dependencies only — a devDependency cannot end up in the bundle. */
function runtimeDeps(pkgPath: string): string[] {
  return Object.keys(manifest(pkgPath).dependencies ?? {});
}

const WORKSPACE_PATHS: Record<string, string> = {
  '@platform/data': 'packages/data',
  '@platform/data-supabase': 'packages/data-supabase',
  '@platform/db': 'packages/db',
  '@platform/shared': 'packages/shared',
  '@platform/ui': 'packages/ui',
};

/** Every package the app pulls in at runtime, transitively. */
function closure(start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const path = queue.pop() as string;
    for (const dep of runtimeDeps(path)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      const nested = WORKSPACE_PATHS[dep];
      if (nested) queue.push(nested);
    }
  }

  return seen;
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo']);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('the Minute dependency boundary', () => {
  it('pulls in nothing from the agent stack, transitively', () => {
    // Transitively, not just directly: adding @platform/signal to @platform/ui
    // would put a Signal client in this app without touching its manifest.
    const deps = closure('apps/client');

    for (const forbidden of FORBIDDEN) {
      expect([...deps]).not.toContain(forbidden);
    }
  });

  it('reaches the live adapter and not the fixture one', () => {
    const deps = closure('apps/client');

    expect([...deps]).toContain('@platform/data-supabase');
    expect([...deps]).not.toContain('@platform/data-fixtures');
  });

  it('never names the service role key in any source file', () => {
    // The key bypasses RLS entirely. Every tenancy guarantee in this app is an
    // RLS policy, so a single server action holding this key would undo the
    // whole hardening migration — and it would undo it silently, because
    // everything would still work and simply return more than it should.
    const offenders = sourceFiles(APP_ROOT)
      .filter((file) => !file.endsWith('boundary.test.ts'))
      .filter((file) => /SERVICE_ROLE/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('never imports the service-role client from @platform/db', () => {
    // `@platform/db`'s root export constructs a client from
    // SUPABASE_SERVICE_ROLE_KEY at import time. This app may use its *types*,
    // and must not use that client — so the type-only import is the only
    // permitted shape, and a value import of it is the thing being caught.
    const offenders = sourceFiles(APP_ROOT)
      .filter((file) => !file.endsWith('boundary.test.ts'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        const imports = source.match(/^import\s+(?!type\s)[^;]*from\s+'@platform\/db'/gm);
        return imports !== null;
      });

    expect(offenders).toEqual([]);
  });

  it('has no database write path beyond the two the contract allows', () => {
    // Rule 1 of the compliance architecture: the app never captures a
    // subscriber's personal circumstances, and the enforcement is that there is
    // nowhere to put them. `apps/demo` asserts its write surface is empty; this
    // app's is exactly two methods, so the equivalent assertion is that no
    // source file writes to a table directly.
    //
    // Matched on the query-builder shape — `.from('table')` followed by a
    // mutation — rather than on the method names alone. The first version of
    // this test matched `.insert(` anywhere and caught `lib/prepare/store.ts`,
    // which does nothing but write: to IndexedDB, on the subscriber's own
    // device, which is the entire two-layer model working as designed. A test
    // that has to be suppressed on the file it was most meant to protect is
    // the wrong test.
    const TABLE_WRITE = /\.from\(\s*['"][a-z_]+['"]\s*\)[\s\S]{0,240}?\.(insert|update|upsert|delete)\(/;

    const offenders = sourceFiles(APP_ROOT)
      .filter((file) => !file.endsWith('boundary.test.ts'))
      .filter((file) => TABLE_WRITE.test(readFileSync(file, 'utf8')));

    expect(
      offenders.map((f) => f.replace(APP_ROOT, '')),
      'Writes belong in ClientWriteRepository, which is two methods and no free '
        + 'text. A write here is a write nobody reviewed against Rule 1.',
    ).toEqual([]);
  });

  it('still catches a direct table write when one is added', () => {
    // The narrowing above could have been narrowed into uselessness, so the
    // pattern is exercised against the thing it exists to catch.
    const TABLE_WRITE = /\.from\(\s*['"][a-z_]+['"]\s*\)[\s\S]{0,240}?\.(insert|update|upsert|delete)\(/;

    expect(
      TABLE_WRITE.test("await supabase.from('client_users').update({ full_name: name })"),
    ).toBe(true);
    expect(TABLE_WRITE.test("await store.put(pack); await store.delete(id)")).toBe(false);
  });
});

/**
 * What a subscriber is granted in the database, as distinct from what the app
 * happens to query.
 *
 * The two drift apart in one direction only: a policy can outlive the code that
 * needed it, and an open grant on an unread table is the worst shape for that,
 * because wiring it up later looks like using an existing permission rather
 * than making a decision.
 *
 * `advisors_partners` was exactly that. It was granted to subscribers on the
 * reading that `/directory` shows "every listed entity", and nothing ever read
 * it. It holds named individuals with `bio`, `rate_notes` and an
 * `engagement_model` that allows 'revenue_share' — which `no_fees_mvp` does not
 * reach, so an advisor on a revenue share could appear in the directory while
 * `/directory/how-we-make-money` truthfully reported no fees. See
 * `supabase/migrations/20260912060000_close_advisor_client_read.sql`.
 */
describe('what subscribers are granted in the database', () => {
  const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

  function migrationSql(): string {
    return readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(join(MIGRATIONS, file), 'utf8'))
      .join('\n');
  }

  it('does not leave the broad listing grant on advisors_partners', () => {
    const sql = migrationSql();

    // Created then dropped is fine — the migrations replay in order and the
    // drop is last. What must not happen is a create with no drop after it.
    const created = sql.lastIndexOf('CREATE POLICY "advisors_partners_client_read"');
    const dropped = sql.lastIndexOf('DROP POLICY IF EXISTS "advisors_partners_client_read"');

    expect(
      created === -1 || dropped > created,
      'advisors_partners holds named individuals with an unconstrained engagement_model. '
        + 'Re-granting the listing needs a classification gate, the fee rule extended to reach '
        + 'it, and a heading that is not a restricted term — see the migration header.',
    ).toBe(true);
  });

  it('still lets the disclosure route name an advisor BTS has an arrangement with', () => {
    // The narrow grant that replaced the broad one, and it is not optional.
    // `disclosures()` resolves entity names for both entity_types; with no
    // grant at all an advisor relationship renders as "Unnamed entity" —
    // disclosing that an arrangement exists while hiding who it is with, on
    // the one page whose entire purpose is candour about BTS's own revenue.
    const sql = migrationSql();

    expect(sql).toContain('CREATE POLICY "advisors_partners_client_disclosure_read"');
    // Scoped by an existence check against commercial_relationships, so an
    // advisor with no arrangement stays invisible.
    expect(sql).toMatch(/advisors_partners_client_disclosure_read[\s\S]{0,600}commercial_relationships/);
  });

  it('has no advisors domain on the client contract', () => {
    // The compile-time half of the same rule. A domain here would be the
    // natural next step after a grant, and the two should fail together.
    expect(CLIENT_READ_DOMAINS).not.toContain('advisors');
  });
});
