import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Screenshot baselines for `apps/demo`.
 *
 * The easy case the whole seam was built to produce: no auth, no backend, no
 * request interception, no fixture files for either. The demo is public and
 * fixture-backed, so a spec is `goto` and `toHaveScreenshot` — which is why
 * `e2e/fixtures/auth.ts` and `e2e/fixtures/supabase.ts`, the two hardest files
 * in the original E2E proposal, are never written.
 *
 * Fonts are self-hosted by `next/font`, so a run makes no external request and
 * the first screenshot is not racing a CDN.
 *
 * ## Before the baselines exist
 *
 * Screenshot baselines can only be generated inside the CI container image —
 * font hinting differs enough elsewhere that foreign ones diff on every run —
 * so there is a window between these specs landing and someone running
 * `workflow_dispatch: update_baselines`. In that window the screenshot cases
 * **skip** rather than fail.
 *
 * That is not softening the check. A permanently red advisory workflow trains
 * everyone to ignore it, which is exactly the argument against baselines that
 * diff daily — and nine `A snapshot doesn't exist` errors, each retried twice
 * by a `retries: 2` that cannot possibly help, is noise standing in front of
 * the steps that do carry signal.
 *
 * The guard is the whole directory, not the individual file. Once baselines
 * exist, a *missing* one fails loudly again — because at that point it means
 * someone added a route and did not regenerate, which is a real problem.
 *
 * ## Why anything is masked
 *
 * Every fixture date is an offset from today, so a page showing one renders
 * different text on every run and its baseline would diff daily. A suite that
 * fails every morning is a suite everyone learns to ignore, which is worse than
 * not having it. Volatile text carries `data-volatile` in the demo's markup and
 * is masked here; only `/market-reports` currently has any, and the mask is a
 * fixed-size block over an ISO date, so layout is still covered.
 *
 * The trace replay is *not* masked: its `recordedAt` is a real fixed instant
 * (the one exception to relative dating), so it renders identically every run.
 */

/** The demo's routes, and what each one is in the set to catch. */
const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/market-reports', name: 'market-reports' },
  { path: '/news', name: 'news' },
  { path: '/activity', name: 'activity' },
  { path: '/content', name: 'content' },
  { path: '/signals', name: 'signals' },
  { path: '/crm/companies', name: 'companies' },
  { path: '/architecture', name: 'architecture' },
  { path: '/agents/run/variant-gate-web', name: 'trace-replay' },
] as const;

/**
 * Playwright writes baselines beside the spec, in `<spec>-snapshots/`. Its
 * absence means "not bootstrapped yet"; its presence means every route in it
 * should have one.
 */
const E2E_DIR = join(process.cwd(), 'e2e');

// Resolved from cwd rather than import.meta — the root package.json has no
// `"type": "module"`, so Playwright's loader treats this file as CJS. Guarded
// loudly, because the failure mode of a wrong cwd here is *silently skipping
// every screenshot*, which looks exactly like a healthy run.
if (!existsSync(E2E_DIR)) {
  throw new Error(
    `e2e/ not found at ${E2E_DIR}. Run from the repo root via \`pnpm test:visual\`.`,
  );
}

const BOOTSTRAPPED = existsSync(join(E2E_DIR, 'demo-surfaces.spec.ts-snapshots'));

test.describe('demo surfaces', () => {
  for (const { path, name } of ROUTES) {
    test(`${name} renders`, async ({ page }) => {
      test.skip(
        !BOOTSTRAPPED,
        'No baselines yet. Generate them in the CI container image — run the ' +
          'Visual regression workflow with update_baselines, or `pnpm test:visual:update` ' +
          'on a machine with Docker — then commit e2e/**-snapshots/.',
      );

      await page.goto(path);
      // Self-hosted and same-origin, so this resolves promptly. Still waited
      // on: without it the first screenshot of a run captures the fallback
      // stack and every later one captures the real face — a diff with no
      // cause.
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`demo-${name}.png`, {
        fullPage: true,
        mask: [page.locator('[data-volatile]')],
      });
    });
  }
});

test.describe('every surface carries the demo chrome', () => {
  // The disclosure banner is a compliance mitigation and has to be on every
  // route, not just the ones someone remembered. A per-route screenshot would
  // catch its absence only if a reviewer noticed it in a diff.
  for (const { path, name } of ROUTES) {
    test(`${name} discloses that the data is invented`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });

      await expect(
        page.getByText(/real BTS operations platform running on invented data/),
      ).toBeVisible();
      await expect(page.getByText('Demo data')).toBeVisible();
    });
  }
});

test.describe('the demo reaches no backend', () => {
  // Nine navigations in one case, on a cold server. The default 30s budget is
  // for a single interaction, not a crawl.
  test.setTimeout(180_000);

  test('issues no request outside its own origin, at all', async ({ page }) => {
    // The structural claim — no database client anywhere in the dependency
    // graph — is asserted in `apps/demo/lib/boundary.test.ts`. This is the
    // behavioural half: watch what the page actually asks for.
    //
    // There is no exception list. There was one for Google Fonts until the
    // demo started self-hosting them, and writing the exception is what made it
    // obvious the request should not exist.
    const external: string[] = [];
    page.on('request', (request) => {
      const { hostname } = new URL(request.url());
      if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
        external.push(request.url());
      }
    });

    for (const { path } of ROUTES) {
      await page.goto(path);
    }

    expect(external).toEqual([]);
  });
});
