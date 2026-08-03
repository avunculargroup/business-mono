# Report Ingestion (PDF/HTML Monitoring) — build progress

Running record of what has shipped against
[`html-pdf-monitoring.md`](./html-pdf-monitoring.md), and what is still open.
Same purpose as `docs/features/ecosystem/build-progress.md` and
`docs/news-source-email-build-progress.md`.

**Status:** planning complete, nothing implemented yet. This document exists so
the next session can start straight at Session 1 without re-deriving the
reconciliation work below.

---

## Planning outcome

The spec as written doesn't match the deployed schema or this codebase's Mastra
conventions closely enough to build literally. Before any code lands, a full
pass reconciled it against `schema.sql`, `apps/agents/src/workflows/
ingestNewsItem.ts`, and the already-shipped sibling feature
`ecosystem_watches`/`ecosystem_changes` (`docs/features/ecosystem/
ecosystem-signal-feature.md`, code in `apps/agents/src/lib/ecosystem/`), which
solved the same "typed watch adapters, discovery vs. detection, silent-failure
health" problem for a different domain and is the direct structural template
for this feature's discovery layer.

The reconciled, session-by-session plan is not duplicated here — see the
**Context** and **Reconciliation** sections at the top of the plan this
progress doc tracks against. In short, the corrections that ripple through
everything:

- `news_items` real columns are `body_markdown`/`topic_tags`/`curator_notes`
  (not `body`/`tags`/`curator_note`), and `category news_category NOT NULL` is
  a 4-value enum the spec never accounts for populating — every report must go
  through the existing `extractNewsMetadata()` before `ingestNewsItem()`.
- There's no `news_items.content_hash` column; artefact identity (`content_hash`)
  lives on the new `reports` table, and `news_items` dedup stays on its existing
  `url` UNIQUE path.
- The spec's `createNewsItem` + `scoreWithRex` workflow steps collapse into a
  single call to the **existing** `ingestNewsItem()` pipeline (dedupe → embed →
  semantic-dedupe/novelty via `vector_search_news` → Rex rubric → persist) —
  no parallel scoring/persistence path gets built.
- This codebase never uses Mastra's `.foreach()`/`.branch()`/`.parallel()`
  combinators — every batch/loop ingestion path (RSS, podcast, ecosystem
  watches, newsletter links) is plain `for` loops in plain async functions
  called from a routine handler or listener. The discovery/acquisition/
  extraction pipeline is planned as `apps/agents/src/lib/reportWatch/`,
  mirroring `apps/agents/src/lib/ecosystem/` file-for-file, not a Mastra
  step-graph.
- Scheduling goes through the existing `routines` table (a new
  `report_watch_scan` action type, following `runNewsSourceScan`/
  `runPodcastIngest`'s exact shape), not the Mastra-native-schedule bypass
  `ecosystemScanWorkflow` uses — ecosystem needed that bypass for hourly
  granularity `routines.frequency` can't express; report-watch only needs one
  uniform daily cadence, which `routines` already supports.
- The web UI has no `/research` section to build into — the real target is the
  existing `apps/web/app/(app)/news/` tree (`news/sources`'s
  `NewsSourceForm.tsx` already implements the progressive-disclosure-by-type
  pattern the spec wants; the "money switch" convention used for the Deepgram
  toggle is the direct precedent for the OCR toggle).
- `agent_activity` logging reuses `agent_name: 'rex'` rather than adding a new
  roster label, following the exact rationale `lib/ecosystem/index.ts::logRun`
  already documents (avoids widening three CHECK constraints for a name that's
  just a log tag).

## Decisions locked in

- **OCR vendor: LlamaParse.** Cloud API, simple API-key auth, used only as the
  fallback branch of the extraction waterfall (gated on `source.ocr_enabled`,
  capped at `ocr_page_limit` pages) — `unpdf` handles the cheap deterministic
  PDF text-layer path first, so LlamaParse is only ever called on pages that
  fail the text-layer quality gate.
- **New dependencies approved:** `unpdf` (PDF text layer), `cheerio`
  (index-page CSS-selector scraping — this codebase's existing HTML handling
  is deliberately regex-based, but arbitrary publisher markup won't survive
  that approach), `robots-parser` (crawl politeness). Sitemap parsing stays
  regex-based (`<loc>`/`<lastmod>` extraction) — no library needed there.
- **All three detection strategies ship together:** RSS, sitemap, index-page
  scrape. Index-page scraping is the only one that covers publishers with no
  feed or sitemap at all (River, Fidelity), so it isn't deferrable without
  losing much of the feature's point.

---

## Not yet started

All nine planned sessions, in dependency order. Each is a new file set plus
tests — none has landed yet.

| Session | Scope | Key new files |
|---|---|---|
| 1 — Data layer | Migration (`news_sources`/`news_items` additive columns, `report_candidates`/`reports`/`report_segments`, two views, `search_segments()` RPC, `reports` storage bucket + RLS), `schema.sql` + `docs/schema-changes.md` updates | `supabase/migrations/<ts>_add_report_watch.sql`, `packages/shared/src/reportWatch.ts` |
| 2 — Discovery | Adapter contract + registry + all three detection strategies (`rss`, `sitemap`, `index_page`) + URL normalisation | `apps/agents/src/lib/reportWatch/{types,registry,http,normalize,discover}.ts`, `adapters/{rss,sitemap,indexPage}.ts` |
| 3 — Acquisition | HEAD check, crawl-delay + robots.txt honouring, hash-and-dedupe, Storage upload | `apps/agents/src/lib/reportWatch/{acquire,candidateStatus}.ts` |
| 4 — Extraction | PDF text layer (`unpdf`) → quality gate → LlamaParse OCR fallback → Jina Reader HTML path; deterministic quality assessment | `apps/agents/src/lib/reportWatch/extract/{pdfText,ocr,html,index}.ts`, `assessQuality.ts` |
| 5 — Indexing + feed handoff | Page-anchored chunking/embedding into `report_segments`; collapsed call into the existing `ingestNewsItem()` (via `extractNewsMetadata()` first, to fill the NOT NULL `category`) | `apps/agents/src/lib/reportWatch/{chunk,persistReport,toNewsItem}.ts`, two new `modelScopes.ts` entries |
| 6 — Orchestration + scheduling | Entry point looping over active sources; new `routines.action_type = 'report_watch_scan'` + seeded daily routine | `apps/agents/src/lib/reportWatch/index.ts`, `executeRoutineWorkflow.ts` addition |
| 7 — Retrieval | Typed RPC wrapper for `search_segments()`; Charlie/Bruno tool wiring (with `redistribution` joined in, not dropped) | `packages/db/src/rpc/reportSearch.ts` |
| 8 — Source form | `report_watch` type in `NewsSourceForm.tsx`'s progressive disclosure, OCR "money switch," Test Detection dry run | `apps/web/app/actions/reportWatch.ts` |
| 9 — Health + detail UI + Simon | `v_report_watch_health` panel, `/news/[id]` report-specific detail additions (incl. signed-URL "Download original"), Simon's morning-briefing query list addition | `apps/agents/src/agents/simon/index.ts` edit, `news/[id]/actions.ts` |

Full per-session file lists, reconciled column definitions, and test plans are
in the plan this document tracks against (see the implementation plan
referenced in the PR/commit that added this file).
