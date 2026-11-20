# Roundup fixtures

Synthetic multi-story newsletters for the roundup splitter
(`src/lib/roundupSections.ts`) and the freshness regression in
`src/workflows/newsExtract.test.ts` and `evals/news-freshness.eval.ts`.

**Synthetic, like `../newsletters/`.** `business-mono` is public, so nothing
here is copied from `news_items`. Each fixture rebuilds a real issue's
structure in its own words: the section shapes, the order of the stories and
the public facts that matter to the test.

| Fixture | Rebuilt from | What it exercises |
| --- | --- | --- |
| `rba-minutes-roundup` | `news_items` 608dfb11 (17 Nov 2026 roundup, published 2026-11-17T18:52:35Z) | The lead story's news is the **minutes** and why three members dissented (unemployment 4.7%, house prices falling, downturn risk). The 6–3 vote it restates is from 3 Nov and is background. Extraction once filed only the vote and stamped every point `asOf: 2023-11-07` |
