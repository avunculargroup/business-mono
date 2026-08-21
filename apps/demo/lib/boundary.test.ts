import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The demo cannot reach a database, and this is what says so.
 *
 * The guarantee is structural rather than behavioural: there is no runtime
 * guard anywhere: the demo simply does not depend on anything that could open a
 * connection. That is a strong property and an easy one to lose — one `pnpm add`
 * for "just this one page" and it is gone silently, because nothing would fail.
 * So the dependency graph is asserted.
 */
const WORKSPACE_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const FORBIDDEN = [
  '@supabase/supabase-js',
  '@supabase/ssr',
  '@platform/data-supabase',
  '@platform/db',
  '@mastra/core',
];

function manifest(pkgPath: string): { dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(`${WORKSPACE_ROOT}${pkgPath}/package.json`, 'utf8'));
}

/** Runtime dependencies only — a devDependency cannot end up in the bundle. */
function runtimeDeps(pkgPath: string): string[] {
  return Object.keys(manifest(pkgPath).dependencies ?? {});
}

const WORKSPACE_PATHS: Record<string, string> = {
  '@platform/data': 'packages/data',
  '@platform/data-fixtures': 'packages/data-fixtures',
  '@platform/shared': 'packages/shared',
  '@platform/ui': 'packages/ui',
};

/** Every package the demo pulls in at runtime, transitively. */
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

describe('the demo dependency boundary', () => {
  it('pulls in nothing that can open a database connection, transitively', () => {
    // Transitively, not just directly: adding @platform/db to @platform/ui
    // would put a client in the demo without touching the demo's own manifest.
    const deps = closure('apps/demo');

    for (const forbidden of FORBIDDEN) {
      expect([...deps]).not.toContain(forbidden);
    }
  });

  it('reaches the fixture adapter and not the live one', () => {
    const deps = closure('apps/demo');

    expect([...deps]).toContain('@platform/data-fixtures');
    expect([...deps]).not.toContain('@platform/data-supabase');
  });

  it('keeps the fixture adapter free of a database client of its own', () => {
    // The adapter is where a "just fetch it live" shortcut would be most
    // tempting, and it is the one package whose whole value is not having one.
    expect(runtimeDeps('packages/data-fixtures').sort()).toEqual([
      '@platform/data',
      '@platform/shared',
    ]);
  });
});
