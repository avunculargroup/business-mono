import { expect, test } from '@playwright/test';

/**
 * The annotation layer, walked in a real browser.
 *
 * The overlay measures targets with `getBoundingClientRect` and positions
 * markers absolutely against a viewport-fixed layer. None of that is exercised
 * by the jsdom component tests, which have no layout engine — every rect there
 * is zero. So the two claims that need a browser are here: that markers land on
 * their targets, and that turning the layer on moves nothing underneath it.
 */

/** Routes that carry annotations, and how many each should show. */
const ANNOTATED = [
  { path: '/', count: 1 },
  { path: '/market-reports', count: 1 },
  { path: '/news', count: 1 },
  { path: '/content', count: 2 },
  { path: '/agents/run/variant-gate-web', count: 4 },
] as const;

async function showArchitecture(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Show architecture' }).click();
}

async function open(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
}

test.describe('the toggle', () => {
  // One test per route rather than a loop: five navigations in one case share a
  // single 30s budget, and the first slow one takes the other four down with it.
  for (const { path, count } of ANNOTATED) {
    test(`defaults to product view on ${path}`, async ({ page }) => {
      // Show the real thing first. An app that opens covered in callouts is a
      // diagram, and the point of building this on the real platform is that it
      // is not one.
      await open(page, path);

      await expect(page.getByRole('button', { name: 'Show architecture' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(page.getByRole('button', { name: /^Annotation 1/ })).toHaveCount(0);
    });

    test(`shows ${count} annotation(s) on ${path}`, async ({ page }) => {
      await open(page, path);
      await showArchitecture(page);

      await expect(page.getByRole('button', { name: /^Annotation \d+:/ })).toHaveCount(count);
    });
  }

  test('shows nothing on a route with no annotations', async ({ page }) => {
    await open(page, '/crm/companies');
    await showArchitecture(page);

    await expect(page.getByRole('button', { name: /^Annotation \d+:/ })).toHaveCount(0);
  });
});

test.describe('the overlay does not disturb the page', () => {
  test('leaves every target where it was', async ({ page }) => {
    // The requirement is "must not reflow the underlying layout", and it is
    // held structurally: outlines are drawn *over* targets on a fixed,
    // pointer-events-none layer rather than applied as borders *to* them. A
    // border would move everything after each target by two pixels — invisible
    // in review and obvious in a diff. This measures it.
    await open(page, '/content');
    const targets = page.locator('[data-annotation-id]');
    const before = await targets.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { top, left, width, height } = node.getBoundingClientRect();
        return { top, left, width, height };
      }),
    );

    await showArchitecture(page);
    const after = await targets.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { top, left, width, height } = node.getBoundingClientRect();
        return { top, left, width, height };
      }),
    );

    expect(after).toEqual(before);
  });

  test('leaves the page height unchanged', async ({ page }) => {
    await open(page, '/agents/run/variant-gate-web');
    const before = await page.evaluate(() => document.body.scrollHeight);

    await showArchitecture(page);

    expect(await page.evaluate(() => document.body.scrollHeight)).toBe(before);
  });
});

test.describe('markers', () => {
  test('land on the element they describe', async ({ page }) => {
    // The thing jsdom cannot check: every rect there is zero, so a marker
    // positioned by measurement is untested until a layout engine runs.
    await open(page, '/');
    await showArchitecture(page);

    const target = await page.locator('[data-annotation-id="indicator-delta"]').boundingBox();
    const marker = await page.getByRole('button', { name: /^Annotation 1:/ }).boundingBox();

    expect(target).not.toBeNull();
    expect(marker).not.toBeNull();
    // The marker sits at the target's top-left corner, offset by its own half
    // width. Anywhere within the target's own box plus a marker's width is
    // "on it"; the failure this catches is a marker stranded at 0,0 or at the
    // far end of the page.
    expect(Math.abs(marker!.x - target!.x)).toBeLessThan(40);
    expect(Math.abs(marker!.y - target!.y)).toBeLessThan(40);
  });

  test('are reachable by keyboard and open their panel', async ({ page }) => {
    await open(page, '/content');
    await showArchitecture(page);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /^Annotation 1:/ })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: /Read the reasoning/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: /Read the reasoning/ })).toHaveCount(0);
  });

  test('link to a section that exists on the architecture page', async ({ page }) => {
    // The panel promises "read the reasoning behind this". A link to a missing
    // anchor lands at the top of the page and reads as a broken promise.
    await open(page, '/');
    await showArchitecture(page);
    await page.getByRole('button', { name: /^Annotation 1:/ }).click();

    const href = await page.getByRole('link', { name: /Read the reasoning/ }).getAttribute('href');
    expect(href).toMatch(/^\/architecture#/);

    await open(page, href!);
    const anchor = href!.split('#')[1];
    await expect(page.locator(`#${anchor}`)).toBeVisible();
  });
});
