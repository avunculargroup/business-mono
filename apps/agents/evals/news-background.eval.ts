/**
 * News background-fact eval — the 25 Oct digest regression.
 *
 * A fresh article restated a month-old RBA hike as context, extraction stored
 * it as a plain fact, and the digest intro reported "The RBA raised the cash
 * rate to 4.60%" as that morning's news. For every fixture in
 * `evals/news-background/fixtures.json` this runs, against a real LLM:
 *
 *   1. extractNewsMetadata — the fact must come back as kind 'background'
 *      (backgroundClassifiedScorer).
 *   2. draftIntro — the same intro step the news_curation routine runs, fed the
 *      article exactly as the routine would (new points only). The intro must
 *      not state the fact (introOmitsFactScorer).
 *
 * Every fixture must score 1 on both: these are golden cases, not a sample.
 *
 * This hits real APIs. Don't run it in CI. Locally:
 *   pnpm --filter @platform/agents test:eval
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newKeyPoints } from '@platform/shared';
import { extractNewsMetadata } from '../src/workflows/newsExtract.js';
import { draftIntro, type CurationCandidate } from '../src/workflows/executeRoutineWorkflow.js';
import { backgroundClassifiedScorer, introOmitsFactScorer } from './scorers/backgroundFact.js';

interface Fixture {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  content: string;
  factPattern: string;
  rationale: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: Fixture[] = JSON.parse(
  readFileSync(resolve(here, 'news-background/fixtures.json'), 'utf-8'),
);

describe('news-background eval', () => {
  for (const f of fixtures) {
    it(`${f.id}: background fact is classified and kept out of the intro`, async () => {
      const groundTruth = { factPattern: f.factPattern };

      const { data, reason } = await extractNewsMetadata({ title: f.title, source: f.source, content: f.content });
      expect(data, `extraction failed: ${reason}`).not.toBeNull();
      const points = data!.key_points;
      // eslint-disable-next-line no-console
      console.table(points);

      const classified = await backgroundClassifiedScorer.run({ output: points, groundTruth });

      const candidate: CurationCandidate = {
        kind: 'news',
        id: f.id,
        title: f.title,
        url: f.url,
        source_name: f.source,
        category: data!.category,
        summary: data!.summary,
        key_points: newKeyPoints(points).map((p) => p.text),
        published_at: f.publishedAt,
      };
      const intro = await draftIntro([candidate]);
      // eslint-disable-next-line no-console
      console.log(`intro: ${intro}`);

      const omitted = await introOmitsFactScorer.run({ output: intro, groundTruth });

      expect(classified.score, 'restated fact was not extracted as background').toBe(1);
      expect(omitted.score, 'intro restated the background fact (or came back empty)').toBe(1);
    });
  }
});
