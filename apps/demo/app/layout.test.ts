import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The demo must be rendered per request, and this is what says so.
 *
 * Deleting `export const dynamic = 'force-dynamic'` breaks nothing loudly: the
 * build succeeds, every page still renders, and no other test notices. Next
 * simply prerenders once, `new Date()` is evaluated at build time, and every
 * fixture date — all of which are offsets from `ReadContext.asOf` — freezes
 * against that moment forever. So the source is read rather than imported;
 * importing the layout would pull `next/font` and the CSS through it.
 */
const LAYOUT = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');

describe('the root layout', () => {
  it("exports dynamic = 'force-dynamic'", () => {
    expect(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(LAYOUT),
      "app/layout.tsx no longer exports dynamic = 'force-dynamic'. Without it Next " +
        'prerenders the demo once at build time: every relative fixture date freezes ' +
        'against the build date, so a demo built in August calls August "today" for ' +
        'the rest of its life and the research digest is permanently empty. The pages ' +
        'still render and the build still passes — that is why this test exists.',
    ).toBe(true);
  });
});
