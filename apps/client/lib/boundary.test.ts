import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  it('has no write path beyond the two the contract allows', () => {
    // Rule 1 of the compliance architecture: the app never captures a
    // subscriber's personal circumstances, and the enforcement is that there is
    // nowhere to put them. `apps/demo` asserts its write surface is empty; this
    // app's is exactly two methods, so the equivalent assertion is that no
    // source file inserts or updates anything directly.
    const offenders = sourceFiles(APP_ROOT)
      .filter((file) => !file.endsWith('boundary.test.ts'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /\.(insert|update|upsert|delete)\(/.test(source);
      });

    expect(
      offenders.map((f) => f.replace(APP_ROOT, '')),
      'Writes belong in ClientWriteRepository, which is two methods and no free '
        + 'text. A write here is a write nobody reviewed against Rule 1.',
    ).toEqual([]);
  });
});
