/**
 * News freshness eval — the 17 Nov social-post regression.
 *
 * A roundup newsletter's lead story reported the RBA minutes, which explained
 * why three members dissented from the 3 Nov rise. Extraction filed only the
 * restated vote (as background), stamped every point asOf '2023-11-07', and the
 * social-post routine hooked on the 15-day-old vote.
 *
 * Against a real LLM, over `test/fixtures/roundups/rba-minutes-roundup.md`
 * (synthetic — see that folder's README), both as a multi-story source and
 * as a whole item:
 *   - some kind='new' point is about the minutes and the dissenters' reasons;
 *   - every asOf is null or a valid date no later than publication;
 *   - no asOf is in 2023.
 *
 * The mocked half of this regression runs in CI (newsExtract.test.ts). This
 * one hits real APIs. Don't run it in CI. Locally:
 *   pnpm --filter @platform/agents test:eval
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidAsOf, melbourneDate } from '@platform/shared';
import { extractNewsMetadata } from '../src/workflows/newsExtract.js';

const here = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(resolve(here, '../test/fixtures/roundups/rba-minutes-roundup.md'), 'utf-8');

// The real item's timestamp. The eval runs whenever, so the freshness retry
// is exercised only by publishing "now"; the date rules are checked against
// whichever date was used.
const cases = [
  { name: 'as a multi-story source', multiStory: true, publishedAt: new Date().toISOString() },
  { name: 'as a whole item', multiStory: false, publishedAt: new Date().toISOString() },
  { name: 'at its real publication time', multiStory: true, publishedAt: '2026-11-17T18:52:35Z' },
];

describe('news-freshness eval', () => {
  for (const c of cases) {
    it(`rba-minutes-roundup ${c.name}: the minutes are new, and asOf is safe`, async () => {
      const { data, reason, flags } = await extractNewsMetadata({
        title: 'Rate split deepens on the RBA board',
        source: 'Roundup',
        content,
        publishedAt: c.publishedAt,
        multiStory: c.multiStory,
      });
      expect(data, `extraction failed: ${reason}`).not.toBeNull();
      const points = data!.key_points;
      // eslint-disable-next-line no-console
      console.table(points);

      const minutes = points.find(
        (p) => p.kind === 'new' && /minute/i.test(p.text) && /unemployment|house price|downturn|recession|growth/i.test(p.text),
      );
      expect(minutes, 'no new point about the minutes and the dissenters\' reasons').toBeDefined();

      const published = melbourneDate(c.publishedAt)!;
      for (const p of points) {
        if (p.asOf == null) continue;
        expect(isValidAsOf(p.asOf), `invalid asOf ${p.asOf}`).toBe(true);
        expect(p.asOf <= published.slice(0, p.asOf.length), `asOf ${p.asOf} after ${published}`).toBe(true);
        expect(p.asOf.startsWith('2023'), `asOf in 2023: ${p.text}`).toBe(false);
      }
      expect(flags).toEqual([]);
    });
  }
});
