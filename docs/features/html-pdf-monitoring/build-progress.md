# Report Ingestion (PDF/HTML Monitoring) — build progress

Running record of what has shipped against
[`html-pdf-monitoring.md`](./html-pdf-monitoring.md), and what is still open.
Same purpose as `docs/features/ecosystem/build-progress.md` and
`docs/news-source-email-build-progress.md`.

**Status:** all nine planned sessions implemented. Not yet exercised against a
real publisher — see **Not verified against live sources** below.

---

## Planning outcome

The spec as written didn't match the deployed schema or this codebase's Mastra
conventions closely enough to build literally. Before any code landed, a full
pass reconciled it against `schema.sql`, `apps/agents/src/workflows/
ingestNewsItem.ts`, and the already-shipped sibling feature
`ecosystem_watches`/`ecosystem_changes` (`docs/features/ecosystem/
ecosystem-signal-feature.md`, code in `apps/agents/src/lib/ecosystem/`), which
solved the same "typed watch adapters, discovery vs. detection, silent-failure
health" problem for a different domain and is the direct structural template
for this feature's discovery layer.

The corrections that rippled through everything, all of them honoured in the
shipped code:

- `news_items` real columns are `body_markdown`/`topic_tags`/`curator_notes`
  (not `body`/`tags`/`curator_note`), and `category news_category NOT NULL` is
  a 4-value enum the spec never accounts for populating — every report goes
  through the existing `extractNewsMetadata()` before `ingestNewsItem()`.
- There's no `news_items.content_hash` column; artefact identity (`content_hash`)
  lives on the new `reports` table, and `news_items` dedup stays on its existing
  `url` UNIQUE path.
- The spec's `createNewsItem` + `scoreWithRex` workflow steps collapsed into a
  single call to the **existing** `ingestNewsItem()` pipeline (dedupe → embed →
  semantic-dedupe/novelty via `vector_search_news` → Rex rubric → persist) —
  no parallel scoring/persistence path was built.
- This codebase never uses Mastra's `.foreach()`/`.branch()`/`.parallel()`
  combinators — every batch/loop ingestion path (RSS, podcast, ecosystem
  watches, newsletter links) is plain `for` loops in plain async functions
  called from a routine handler. The discovery/acquisition/extraction pipeline
  shipped as `apps/agents/src/lib/reportWatch/`, mirroring
  `apps/agents/src/lib/ecosystem/` file-for-file, not a Mastra step-graph.
- Scheduling goes through the existing `routines` table (a new
  `report_watch_scan` action type, following `runNewsSourceScan`/
  `runPodcastIngest`'s exact shape), not the Mastra-native-schedule bypass
  `ecosystemScanWorkflow` uses — ecosystem needed that bypass for hourly
  granularity `routines.frequency` can't express; report-watch only needs one
  uniform daily cadence.
- The web UI has no `/research` section — the real target was the existing
  `apps/web/app/(app)/news/` tree.
- `agent_activity` logging reuses `agent_name: 'rex'` rather than adding a new
  roster label, following the exact rationale `lib/ecosystem/index.ts::logRun`
  already documents.

## Decisions locked in

- **OCR vendor: LlamaParse.** Cloud API, simple API-key auth, used only as the
  fallback branch of the extraction waterfall (gated on `source.ocr_enabled`,
  capped at `ocr_page_limit` pages) — `unpdf` handles the cheap deterministic
  PDF text-layer path first, so LlamaParse is only ever called on pages that
  fail the text-layer quality gate. Needs `LLAMA_CLOUD_API_KEY` set; absent, the
  waterfall keeps the text layer and the report is flagged rather than lost.
- **New dependencies:** `unpdf` (PDF text layer), `cheerio` (index-page
  CSS-selector scraping — added to `apps/web` as well, for Test detection),
  `robots-parser` (crawl politeness). Sitemap parsing stayed regex-based.
- **All three detection strategies shipped together:** RSS, sitemap,
  index-page scrape.

---

## Shipped

| Session | Scope | Key files |
|---|---|---|
| 1 — Data layer | `news_sources`/`news_items` additive columns, `report_candidates`/`reports`/`report_segments`, `v_report_watch_health` + `v_recent_reports`, `search_segments()` RPC, private `reports` bucket + RLS | `supabase/migrations/20260803000000_add_report_watch.sql`, `packages/shared/src/reportWatch.ts` |
| 2 — Discovery | Adapter contract + registry + `rss`/`sitemap`/`index_page` + URL normalisation | `apps/agents/src/lib/reportWatch/{types,registry,http,normalize,discover}.ts`, `adapters/{rss,sitemap,indexPage}.ts` |
| 3 — Acquisition | robots.txt, HEAD, one-hop follow, hash-and-dedupe, Storage upload, candidate state machine | `apps/agents/src/lib/reportWatch/{acquire,robots,candidateStatus}.ts` |
| 4 — Extraction | PDF text layer (`unpdf`) → quality gate → LlamaParse OCR merged page-for-page → Jina Reader HTML path | `apps/agents/src/lib/reportWatch/extract/{pdfText,ocr,html,index}.ts`, `assessQuality.ts` |
| 5 — Indexing + feed handoff | Page-anchored chunking/embedding into `report_segments`; collapsed call into `ingestNewsItem()`; two `modelScopes.ts` entries | `apps/agents/src/lib/reportWatch/{chunk,persistReport,toNewsItem}.ts` |
| 6 — Orchestration + scheduling | Entry point looping over active sources; `routines.action_type = 'report_watch_scan'` + seeded daily routine | `apps/agents/src/lib/reportWatch/index.ts`, `executeRoutineWorkflow.ts`, `supabase/migrations/20260803010000_add_report_watch_routine.sql` |
| 7 — Retrieval | Typed `search_segments()` wrapper carrying `redistribution`; `search_segments` tool on Rex and Charlie | `packages/db/src/rpc/reportSearch.ts`, `apps/agents/src/tools/segments.ts` |
| 8 — Source form | `report_watch` type in `NewsSourceForm.tsx`, OCR money switch, Test detection dry run | `apps/web/app/actions/reportWatch.ts`, `apps/web/lib/news/testDetection.ts` |
| 9 — Health + detail UI + Simon | `v_report_watch_health` panel, report-specific `/news/[id]` additions incl. signed-URL download, Simon's briefing addition | `apps/web/app/(app)/news/sources/ReportWatchHealth.tsx`, `apps/web/app/(app)/news/[id]/{ReportPanel.tsx,actions.ts}`, `apps/agents/src/agents/simon/index.ts` |

### Decisions taken during the build, beyond the plan

- **`v_report_watch_health` uses scalar subqueries, not the spec's two LEFT
  JOINs.** Joining `report_candidates` AND `reports` to the same source row
  multiplies every candidate count by the source's report count. The spec's SQL
  would have reported inflated numbers in the one table built to be trusted.
- **URL normalisation lives in `@platform/shared`, not beside the engine.**
  Both the daily scan and the Test detection button have to apply identical
  rules; a dry run that normalises differently reports something untrue about
  what the scan will find. The hashing stays in the agent server (`node:crypto`,
  and `@platform/shared` is imported by client components).
- **The index-page adapter treats "selector matched nothing" as a parse
  failure, not a clean empty read.** An empty result feeds
  `detection_consecutive_empty`, which is the only silent-failure signal the
  feature has; letting a broken selector report a clean zero would poison it.
- **`detection_consecutive_empty` counts clean-but-empty runs only.** A run that
  errored leaves the counter alone and writes `last_error`. A broken selector
  and a quiet publisher must not look the same in the view built to tell them
  apart.
- **`must_match` is an OR.** The canonical config is `['\\.pdf$', '/reports/']`;
  requiring all patterns would match nothing.
- **OCR merges page-for-page rather than replacing the document.** Pages the
  text layer read correctly keep their better, cheaper text. A scanned appendix
  bolted onto a digital report is common.
- **`search_segments()` carries `redistribution` on every row** (NULL for
  transcript hits), and the agent tool expands it into a plain-English `usage`
  note. A restriction the model has to look up is one it will get wrong.
- **New-table access in the agent server goes through one boundary module**
  (`lib/reportWatch/db.ts`) rather than scattered `as any` casts, so the
  post-`generate-types` cleanup is a single file.
- **Chunk `heading_path` is read at flush time**, from the heading stack as it
  stands when the chunk closes — a chunk is described by the deepest heading
  governing the text it actually contains.

---

## Not verified against live sources

Everything below is implemented and unit-tested against fixtures, but has not
been run against a real publisher. Same caveat as the BGeometrics adapter in
`docs/schema-changes.md`: no network egress was available while writing it.

- **The three detection adapters** parse recorded fixtures correctly. No live
  River / Fidelity / ARK / Bitwise / Glassnode page has been fetched, so the
  real-world selector and sitemap shapes are unconfirmed. Test detection on
  `/news/sources` is the intended way to confirm each one at configuration time.
- **The LlamaParse request/response shape** was written from the documented API
  and not hand-verified against a live call. It fails with the vendor message
  attached rather than silently, and a failure keeps the text-layer result.
- **`search_segments()` and the two views** are written against the deployed
  `transcript_segments`/`podcast_episodes` column names (read from the actual
  definitions, not the podcast spec), but have not been executed. They apply on
  the next push to `main` via `supabase db push`.
- **No report_watch source is seeded.** The daily routine exists and will run,
  finding zero sources until one is configured.

## Deferred (unchanged from the spec's Out of scope / Open Questions)

- Firecrawl for JS-rendered or paginated archives
- Chart/figure extraction via a vision pass; table extraction to structured data
- Paywalled or form-gated reports
- Automatic re-crawl of acquired URLs to detect silent revisions (the schema
  supports it — `revision_of_report_id`/`superseded_at` are wired and tested;
  only the monthly HEAD sweep that would trigger it is missing)
- `report_candidates` pruning
- Merging all configured detection strategies instead of first-wins
