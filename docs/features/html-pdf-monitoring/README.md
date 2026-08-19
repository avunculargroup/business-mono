# Report Ingestion (PDF/HTML monitoring)

Watches publisher pages that never announce themselves — River, Fidelity Digital Assets,
ARK, Bitwise, Glassnode, the ASIC/AUSTRAC publication pages — and turns a newly posted PDF
or HTML report into an acquired, extracted, indexed item in the research feed.

The other four source shapes (RSS, podcast, YouTube, email) hand the platform a change
signal for free. Report publishers do not, which is the whole reason this feature exists:
the discovery layer has to manufacture the signal that the others get from a feed.

**Status:** All nine planned sessions implemented; not yet exercised against a live
publisher. · **Last updated:** 2026-08-11

## Documents in this folder

| File | What it is | Read it when |
|---|---|---|
| [`html-pdf-monitoring.md`](./html-pdf-monitoring.md) | The feature spec — data model, views, unified segment search, the `report-watch-ingestion` workflow, agent integration, UI, RLS | Start here |
| [`build-progress.md`](./build-progress.md) | Running record of what shipped, plus the spec corrections made before any code landed | Before continuing the build, or when the spec and the code disagree |

**Read `build-progress.md` before trusting the spec on details.** The spec did not match the
deployed schema closely enough to build literally — column names, the `news_category` enum,
and the Mastra conventions were all reconciled first, and the corrections are recorded in the
progress doc rather than back-ported into the spec.

## Where the code lives

| Path | Role |
|---|---|
| `apps/agents/src/lib/reportWatch/` | The whole agent-side pipeline: `adapters/` and `discover.ts` (find candidates), `acquire.ts` (fetch), `extract/` and `assessQuality.ts` (text layer + OCR fallback), `chunk.ts` (index) |
| `packages/shared/src/reportWatch.ts` | Shared types |
| `packages/db/src/rpc/reportSearch.ts` | `segmentSearch` over extracted report text |
| `apps/web/app/(app)/news/[id]/` | Reader surface — reports land in the research feed, not a separate section |
| `apps/web/app/(app)/news/sources/ReportWatchHealth.tsx` | Per-watch health panel on the sources page |

> The spec's Web App section describes routes under `/research`. They shipped as `/news` —
> another case where `build-progress.md` is closer to the truth than the spec. Note also
> that `apps/agents/src/lib/report/` is *not* this feature; it is the market-report
> generator behind the findings engine.

Extraction reads the PDF text layer with `unpdf` first and only falls back to LlamaParse for
pages that fail the quality gate — on sources with `ocr_enabled` set, capped at the source's
`ocr_page_limit`. With `LLAMA_CLOUD_API_KEY` unset a scanned report is still acquired and
surfaced, marked `needs_review` with no extracted text, rather than lost.

## Sibling feature

The discovery layer is modelled directly on
[`../ecosystem/ecosystem-signal-feature.md`](../ecosystem/ecosystem-signal-feature.md),
which solved the same "typed watch adapters, discovery vs. detection, silent-failure health"
problem for a different domain. Read that one first if the structure here seems unmotivated.
