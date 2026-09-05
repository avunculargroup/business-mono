import { expect, test } from '@playwright/test';

/**
 * The corporate research surfaces at 360px.
 *
 * A stated acceptance criterion for the feature, and one of the few that a unit
 * test genuinely cannot make: horizontal overflow is a property of the rendered
 * cascade, not of the markup. This asserts it arithmetically rather than by
 * screenshot, so it needs no baseline and gives a specific answer when it fails
 * — which element, and by how much.
 *
 * The record page is the hard case. It carries full-precision quantities, long
 * document titles and a five-column fact grid, every one of which will push a
 * viewport out at 360px if it is allowed to.
 *
 * The comparison table is the deliberate exception: a comparison is inherently
 * columnar, and the alternative to its own scroll container at this width is
 * truncating company names. It scrolls inside itself; the page body does not.
 */

const NARROW = { width: 360, height: 800 };

const ROUTES = [
  { path: '/research', name: 'the register' },
  { path: '/research/demo-meridian-freight', name: 'the flagship record' },
  // The look-through record: its fund-unit quantity is six digits and its
  // custody panel carries the conflict block.
  { path: '/research/demo-verrall-dam', name: 'the look-through record' },
] as const;

test.describe('corporate research at 360px', () => {
  test.use({ viewport: NARROW });

  for (const route of ROUTES) {
    test(`${route.name} does not scroll sideways`, async ({ page }) => {
      await page.goto(route.path);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
      });

      // A single pixel of slop for sub-pixel rounding on borders; anything more
      // is a real overflow.
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`${route.name} keeps every element inside the viewport`, async ({ page }) => {
      await page.goto(route.path);

      // The page-level check above passes if an overflowing child is clipped by
      // an ancestor, which looks fine to a screenshot and reads as truncated
      // data to a person. This finds the child.
      const escaping = await page.evaluate((width) => {
        // An element inside a deliberate scroll container is allowed past the
        // viewport — that is what the container is for. The demo's own nav is
        // one at this width, and so is the archetype comparison table.
        const insideScroller = (element: Element): boolean => {
          for (let node = element.parentElement; node; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
          }
          return false;
        };

        const offenders: string[] = [];
        document.querySelectorAll('body *').forEach((element) => {
          const box = element.getBoundingClientRect();
          if (box.width === 0) return;

          const overflowX = getComputedStyle(element).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return;
          if (insideScroller(element)) return;

          if (box.right > width + 1) {
            const name = typeof element.className === 'string' ? element.className : '';
            offenders.push(`${element.tagName.toLowerCase()}.${name} → ${box.right}`);
          }
        });
        return offenders;
      }, NARROW.width);

      expect(escaping).toEqual([]);
    });
  }
});
