import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Screenshot baselines for the bts-design specimen cards.
 *
 * These exist to catch layout and cascade breakage during the extraction phases of the
 * demo-app plan — Phase 2 moves the token set into @platform/ui, Phase 3 moves the 24
 * components in apps/web/components/ui. Baselines are captured *before* either, because
 * a baseline taken after a refactor only encodes whatever that refactor did, including
 * the breakage it was meant to catch.
 *
 * Coverage note: 14 of the 18 specimens are fully token-driven. The four colour swatch
 * cards (colors-accent, colors-agent, colors-neutrals, colors-semantic) hardcode their
 * chip fills as hex and only *label* them with the token name — reasonable for a swatch
 * that documents a value, but it means those chips will not catch a changed token. Their
 * surrounding chrome still will, since _base.css is entirely var()-driven. Token values
 * are covered exactly by apps/web/app/globals.test.ts; this suite is about rendering.
 *
 * _base.css imports ../colors_and_type.css, so if Phase 2 repoints that at the package
 * and gets it wrong, every specimen here breaks visibly. That is the intended alarm.
 */

// Resolved from cwd rather than import.meta: the root package.json has no
// `"type": "module"`, so Playwright's loader treats this file as CJS and import.meta
// is unavailable. Adding `"type": "module"` at the root to satisfy one spec file has a
// far wider blast radius than resolving from cwd, which is the repo root whenever this
// runs via `pnpm test:visual`. Guarded below so a wrong cwd fails loudly.
const PREVIEW_DIR = join(process.cwd(), '.claude', 'skills', 'bts-design', 'preview');

if (!existsSync(PREVIEW_DIR)) {
  throw new Error(
    `Design-system specimens not found at ${PREVIEW_DIR}. ` +
      'Run this from the repo root via `pnpm test:visual`.',
  );
}

const specimens = readdirSync(PREVIEW_DIR)
  .filter((f) => f.endsWith('.html'))
  .sort();

test.describe('design-system specimens', () => {
  test('the specimen set has not changed', () => {
    // If a card is added or removed, this fails before the per-file loop reports a
    // missing baseline — a clearer signal than 18 screenshot diffs.
    expect(specimens).toEqual([
      'agent-activity-card.html',
      'buttons.html',
      'cards.html',
      'colors-accent.html',
      'colors-agent.html',
      'colors-neutrals.html',
      'colors-semantic.html',
      'inputs.html',
      'logo.html',
      'nav-item.html',
      'radii.html',
      'shadows.html',
      'spacing.html',
      'stage-chips.html',
      'type-body.html',
      'type-display.html',
      'type-mono.html',
      'type-scale.html',
    ]);
  });

  for (const file of specimens) {
    const name = file.replace(/\.html$/, '');

    test(name, async ({ page }) => {
      // colors_and_type.css @imports Google Fonts. Left alone, every test spends ~13s
      // fetching webfonts — two minutes for this file — and the suite silently depends
      // on a third-party CDN being up. Blocking the request makes it hermetic and fast,
      // and the specimens fall back to the system stack deterministically.
      //
      // The cost is that type specimens render in fallback rather than DM Sans, so this
      // suite does not prove the webfonts load. That is the right trade: the font
      // *decision* is asserted exactly in apps/web/app/globals.test.ts, and what these
      // screenshots are for is layout, spacing, colour and cascade — none of which the
      // fallback changes. It also matches the demo's own constraint of working with the
      // network disabled.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

      await page.goto(pathToFileURL(join(PREVIEW_DIR, file)).href);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
    });
  }
});
