import { createFixtureRepositories } from '@platform/data-fixtures';
import type { DemoBundle, ReadContext } from '@platform/data';

/**
 * The bundle for a server component, and the demo's counterpart to
 * `apps/web/lib/repositories.ts`.
 *
 * Two differences, both consequences of there being no backend: it is
 * synchronous, because nothing has to be awaited to construct it, and it cannot
 * fail, because there is no signed-in user for it to be missing.
 */
export function getRepositories(): DemoBundle {
  return createFixtureRepositories();
}

/**
 * The demo's anchor.
 *
 * `new Date()` — the same default the live adapter uses. Every fixture date is
 * an offset from this, so the staged scenario is always "today, yesterday, last
 * week" no matter when someone opens the demo. Pinning it to a literal here is
 * the one change that would quietly break that, which is why it is a function
 * with a comment rather than a constant.
 */
export function demoReadContext(): ReadContext {
  return { asOf: new Date() };
}
