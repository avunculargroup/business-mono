import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { matchesRoute } from '@/lib/routeMatch';
import { ROUTES } from './Nav';

/**
 * The nav is the demo's route inventory, and it is asserted rather than
 * described.
 *
 * A prose list of routes in a README drifts the first time someone adds a page
 * — this compares the nav against `app/` instead, so a new surface with no way
 * to reach it, and a nav entry pointing at a route that was renamed or removed,
 * both fail here.
 */
const APP_DIR = fileURLToPath(new URL('../app', import.meta.url));

/** Every route pattern the app actually serves, bracket segments intact. */
function routePatterns(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${prefix}/${entry.name}`);
      else if (entry.name === 'page.tsx') found.push(prefix === '' ? '/' : prefix);
    }
  };
  walk(APP_DIR, '');
  return found;
}

const hrefs = ROUTES.map((route) => route.href);

describe('the nav and the routes that exist', () => {
  it('links to nothing that is not a real route', () => {
    // A dead link on a page whose whole job is to be trustworthy costs more
    // than a missing section. `/agents/run/variant-gate-web` is a concrete id
    // against a `[traceId]` segment, hence matchesRoute rather than equality.
    const patterns = routePatterns();

    for (const href of hrefs) {
      expect(
        patterns.some((pattern) => matchesRoute(pattern, href)),
        `Nav links to ${href}, which no page.tsx under app/ serves.`,
      ).toBe(true);
    }
  });

  it('reaches every route the app serves', () => {
    // Detail routes are reached from their own index, not from the sidebar, so
    // a route counts as reachable if the nav links to it or to its index. Only
    // a nested route has one — falling back to `/` for a top-level route would
    // make every route reachable through the dashboard and assert nothing.
    for (const pattern of routePatterns()) {
      const segments = pattern.split('/').filter(Boolean);
      const index = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : null;
      const reachable = hrefs.some(
        (href) => matchesRoute(pattern, href) || (index !== null && matchesRoute(index, href)),
      );

      expect(
        reachable,
        `app${pattern}/page.tsx exists but nothing in the nav reaches it. A surface ` +
          'the demo renders and cannot be navigated to is one an evaluator never sees.',
      ).toBe(true);
    }
  });
});
