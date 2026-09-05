import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression for the design system.
 *
 * Deliberately much narrower than apps/web/docs/e2e-playwright-proposal.md. That
 * proposal's two hardest problems — "every page depends on Supabase data, so E2E needs
 * a backend that answers", and injecting an authed session past the middleware gate —
 * do not apply to anything here:
 *
 *   - Today it covers the static design-system specimens in
 *     .claude/skills/bts-design/preview/, which are plain HTML over file:// with no
 *     server, no auth and no data.
 *   - From Phase 5 it also covers apps/demo, which is public and fixture-backed.
 *
 * So neither e2e/fixtures/auth.ts nor e2e/fixtures/supabase.ts is ever written.
 *
 * This suite covers layout and cascade breakage. Token *values* are covered far more
 * precisely, and without a browser, by apps/web/app/globals.test.ts — which runs in the
 * fast blocking gate. Keep the split: exact things belong in Vitest, fuzzy things here.
 *
 * Kept out of `pnpm test` on purpose (see .github/workflows/e2e.yml) so the ~14s
 * Turborepo gate stays fast and browser flake never blocks a PR.
 */
export default defineConfig({
  testDir: './e2e',
  // Baselines are committed and must be regenerated deliberately, never on the fly.
  updateSnapshots: 'none',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],

  /**
   * The demo needs a server; the design-system specimens do not.
   *
   * `apps/demo` is `force-dynamic` (its dates resolve at request time), so there
   * is no static export to read over file:// — it has to be built and served.
   * `reuseExistingServer` keeps a local `pnpm --filter @platform/demo start`
   * from being killed and restarted on every run.
   */
  webServer: {
    // Build first, always. `next start` on a stale or missing `.next` fails,
    // and it would take the design-system specs down with it even though they
    // read file:// paths and need no server at all. A warm rebuild is a few
    // seconds; a confusing failure in an unrelated suite is not.
    //
    // Through Turborepo, not `pnpm --filter`, because the demo's build depends
    // on `@platform/shared` being built: that package resolves its `import`
    // condition to `dist/`, so a *value* imported from it — as opposed to a
    // type, which is erased — cannot be bundled until `tsc` has run there.
    // `--filter=@platform/demo` plus `dependsOn: ["^build"]` builds it first.
    // A plain `pnpm --filter` build passes on any machine that happens to have
    // a stale `dist/` lying around and fails on a clean checkout, which is
    // exactly how this reached CI.
    command:
      'pnpm turbo build --filter=@platform/demo && pnpm --filter @platform/demo start --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  use: {
    // The design-system specs address file:// paths directly and ignore this;
    // the demo specs navigate relative to it.
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    // Escape hatch for environments that ship a preinstalled Chromium whose build
    // number does not match this @playwright/test version — some container images and
    // self-hosted runners. Unset in CI, which uses the matching Playwright image.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
  },

  expect: {
    toHaveScreenshot: {
      // Font hinting and antialiasing differ marginally even within one container
      // image. A small tolerance keeps that from being reported as a design change,
      // while still catching a moved token, a broken cascade, or a layout shift.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  projects: [
    {
      name: 'chromium',
      // Chromium only, one pinned viewport. Cross-browser rendering differences are
      // not what this suite is for, and every extra browser is another baseline set.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
