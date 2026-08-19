import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Design tokens resolve in a real browser.
 *
 * This is the companion to apps/web/app/globals.test.ts, and it covers the one gap that
 * test structurally cannot. The Vitest guard reads CSS files from disk, so it proves the
 * token *values* are right — but a token that is correct in a file and never reaches the
 * browser, because an @import path broke, would sail straight past it.
 *
 * That is exactly the failure mode of Phase 2 of the demo-app plan, which moves the token
 * set into @platform/ui and repoints .claude/skills/bts-design/colors_and_type.css and
 * these specimen pages at the package. Three import chains change at once.
 *
 * Deliberately assertion-based rather than screenshot-based, so it needs **no committed
 * baselines** and is deterministic across machines and container images. That makes it
 * useful immediately, while the screenshot half of this suite waits on a baseline
 * bootstrap that requires Docker.
 */

const PREVIEW_DIR = join(process.cwd(), '.claude', 'skills', 'bts-design', 'preview');

if (!existsSync(PREVIEW_DIR)) {
  throw new Error(
    `Design-system specimens not found at ${PREVIEW_DIR}. ` +
      'Run this from the repo root via `pnpm test:visual`.',
  );
}

/**
 * A representative slice, not the full 74. The Vitest guard owns exhaustive value
 * checking; this asks the narrower question of whether the cascade arrives at all.
 * Spans primitives, an alias that resolves through another token, and each type family.
 */
const EXPECTED: Record<string, string> = {
  '--color-bg': '#FAFAF8',
  '--color-surface': '#FFFFFF',
  '--color-border': '#E8E6E0',
  '--color-text-primary': '#1A1915',
  '--color-accent-base': '#C9A84C',
  '--space-4': '16px',
  '--radius-md': '6px',
  '--text-base': '15px',
};

test.describe('design tokens resolve in the browser', () => {
  test.beforeEach(async ({ page }) => {
    // Match design-system.spec.ts: hermetic, no third-party CDN.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.goto(pathToFileURL(join(PREVIEW_DIR, 'buttons.html')).href);
  });

  test('primitive tokens have computed values', async ({ page }) => {
    const resolved = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
    }, Object.keys(EXPECTED));

    expect(resolved).toEqual(EXPECTED);
  });

  test('aliases resolve through their referenced token', async ({ page }) => {
    // --color-accent is `var(--color-accent-base)` in the source. If the cascade is
    // intact the browser resolves it to the hex; if the import chain broke it resolves
    // to empty. This is the assertion that would catch a bad Phase 2 move.
    const [accent, hover] = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        style.getPropertyValue('--color-accent').trim(),
        style.getPropertyValue('--color-accent-hover').trim(),
      ];
    });

    expect(accent).toBe('#C9A84C');
    expect(hover).toBe('#9A7A2E');
  });

  test('an element actually paints with a token value', async ({ page }) => {
    // The strongest form of the question: not "is the custom property readable" but
    // "did it reach a rendered element". A specimen could read tokens off :root while
    // the rules that consume them failed to load.
    const body = page.locator('body');
    await expect(body).toHaveCSS('background-color', 'rgb(250, 250, 248)'); // --color-bg
  });

  test('no token used by the specimens resolves to empty', async ({ page }) => {
    // Catches a dropped token that nothing in EXPECTED happens to name. Reads every
    // custom property the browser knows about on :root and asserts none is blank.
    const { total, empty } = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const custom = Array.from(style).filter((prop) => prop.startsWith('--'));
      return {
        total: custom.length,
        empty: custom.filter((prop) => style.getPropertyValue(prop).trim() === ''),
      };
    });

    // The count assertion is load-bearing, not decoration. Verified by breaking the
    // @import in _base.css: with no tokens defined at all, `custom` is empty and the
    // filter below passes vacuously — this test reported green while the other three
    // in this file correctly failed. Asserting a floor first makes it fail honestly.
    expect(total).toBeGreaterThan(50);
    expect(empty).toEqual([]);
  });
});
