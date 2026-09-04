# Corporate Holdings — reconciliation and build progress

Reconciliation of the [`corporate-holdings`](./README.md) spec bundle against the live
repository, and a record of what each session shipped. Same purpose as
[`docs/features/demo-app/build-progress.md`](../demo-app/build-progress.md).

**Status:** Sessions 1 (data layer) and 2 (ingest workflow) complete. Session 3 (pages) not
started.
**Last updated:** 2026-09-04

---

## Why this document exists

The spec bundle was written without the repository to hand and says so. Several of its
names, paths and package references are guesses, and two of them are wrong in ways that
would have failed at write time rather than at review time. This file records every one, so
sessions 2 and 3 start from the repo as it is rather than from the spec's picture of it.

Nothing below is a criticism of the spec. The structural decisions all hold; it is the
surface — package names, an app name, one type name, two pieces of DDL — that had to move.

---

## Reconciliation

### Names that moved

| Spec says | Repo has | Why |
|---|---|---|
| `apps/hq` | `apps/web` | The authenticated app has always been `apps/web`. |
| `@bts/data-fixtures` | `@platform/data-fixtures` | Every workspace package is `@platform/*`. |
| `ResearchRepository` | `CorporateHoldingsRepository` | **A collision, not a preference.** `ResearchRepository` already exists and is the *news feed* — `news_items`, the rubric, podcast segments. The two domains are unrelated. The interface is otherwise exactly as specified. |
| `docs/features/corporate-research/` | `docs/features/corporate-holdings/` | The folder was added under the second name. |
| `describeRepository(...)` | `describeCorporateHoldingsContract(...)` | Matches the existing harness in `packages/data/src/testing/`, which is parameterised per domain rather than per repository. |

### Files the spec references — now present, under different names

The three dossiers and the page sample were missing at session 1 and were added to `main`
before session 2. They sit at the top of this folder rather than in `dossiers/` and
`reference/` subdirectories:
[`locate-technologies-dossier.md`](./locate-technologies-dossier.md),
[`digitalx-dossier.md`](./digitalx-dossier.md),
[`block-inc-dossier.md`](./block-inc-dossier.md),
`company-page-sample.html`.

Reading all three changed nothing structural — every decision in session 1 held — but they
supplied the Locate record, which session 1 could not hand-enter without them.

### The open questions, answered

- **Findings Engine integration** — *resolved, and the spec's assumption was wrong.* The
  spec assumed findings write to the existing engine "via subject polymorphism" and told the
  builder to confirm the subject columns rather than create a parallel table. There are no
  subject columns: `finding_metric_config`, `finding_divergence_pairs`,
  `finding_thresholds` and `finding_watch` are keyed on **metric series** for the daily
  market report, and the findings themselves are computed in-process and persisted inside
  `market_reports`. There is nothing to hang a company finding from. `research_findings` is
  therefore its own table. Both engines keep the same rule — the deterministic payload
  commits before any narration — so `summary` and `materiality` are nullable.
- **Peer-shaped matching criteria** — unchanged. `market_cap_band`, `funding_source` and
  `primary_archetype` are columns; the spec's instruction to test them against a fourth and
  fifth record still stands and is a session-3 question.
- **Scale control** — unchanged, and still open. It is a session-3 design problem.

### Two corrections to the reference DDL

Both would have failed at run time, so both are fixed in the migration rather than carried
forward:

1. **The trigger shadowed a column.** `enforce_source_minimum()` declared a local named
   `field_key` and then filtered `field_source_minimums` on `field_key = ...`. The local
   shadows the column, and the insert fails with `missing FROM-clause entry for table
   "enforce_source_minimum"` — an error that says nothing about source classes and would
   have read as a broken gate rather than a naming bug. The local is now `target_field`.
2. **The vector index was the wrong kind.** `document_chunks.embedding` was specified with
   `ivfflat ... WITH (lists = 100)`, which is built at migration time against an empty table
   and produces useless lists. Every other embedding index in this schema is HNSW; this one
   now is too.

### Departures from the fixture roster

| Roster | Shipped | Why |
|---|---|---|
| `demo-kestrel-dam` — Kestrel Digital Asset Management | `demo-verrall-dam` — Verrall Digital Asset Management | `COMPANIES.kestrel` is already Kestrel Freight in the demo's CRM fixtures. Two unrelated fictional entities sharing a name is the "reads as sloppy" failure `entities.ts` exists to prevent. |
| `demo-orrey-capital` — Orrey Capital | `demo-calder-capital` — Calder Capital | Collided with `WATCHED.signingProject`, "Orrery Signer". |
| Posture-change event and holdings snapshot sourced from an investor presentation | Both sourced from exchange announcements | **The roster violated its own schema.** An investor presentation is source rank 4; any ledger row requires rank 2 or better, and the trigger rejects it. It is also the truer account: a capital posture change is only visible by reading a quarterly report against a capital notice, and both are announcements. |

One further constraint the roster did not anticipate: `packages/data-fixtures` already
enforces, by test, that no fixture prose states a bitcoin quantity. The register's quantities
are therefore numeric fields carrying a basis chip and a provenance rail — never a figure
typed into a sentence. That is the rule the feature is about anyway, so it cost nothing.

---

## Session 1 — data layer

**Shipped.**

- **Migration** `supabase/migrations/20260904000000_add_corporate_holdings.sql` — fourteen
  tables, the source-class trigger, five views, RLS, and the three seeded jurisdiction notes
  (`aasb_138_revaluation`, `us_gaap_asc_350_60`, `asx_lr_12_3`), all unpublished. Applied and
  re-applied against a local Postgres 16 to confirm it is idempotent.
- **Acceptance test** `supabase/tests/corporate_holdings_acceptance.sql` — the three session-1
  criteria as assertions, inside a transaction that rolls back. The record it hand-enters is
  the fictional flagship, and rolling back is how "hand-enter the record end to end" and
  "fixture data must never reach the register" are both satisfied.
- **Vocabulary** `packages/shared/src/corporateHoldings.ts` — the CHECK-constraint enums plus
  `STALE_AFTER_DAYS` and `MATERIALITY_FLOOR`. `holding_bases` and `source_classes` are
  deliberately *not* modelled as authoritative unions: they are lookup tables because a fifth
  basis is expected.
- **Interface** `packages/data/src/repositories/corporateHoldings.ts` — as the spec's adapter
  contract, plus `PositionSummary` (the aggregate is decided by the adapter, not by three
  components that each filter the rows), `StructuralAbsence`, and `ArchetypeMismatchError`.
- **Conformance suite** `packages/data/src/testing/corporateHoldings.ts` — the six cases the
  demo requirements name, plus five more. Parameterised over a scenario named by *pathology*
  rather than by company, so an adapter with no non-comparable holding fails to construct the
  scenario instead of quietly skipping the case.
- **Both adapters** — `packages/data-fixtures/src/repositories/corporateHoldings.ts` over the
  five-record fixture set, and `packages/data-supabase/src/repositories/corporateHoldings.ts`
  over the views. Both pass the same suite.
- **The Supabase fake grew a queryable dataset.** `__setDataset` in
  `packages/data-supabase/test/mocks/supabase.ts` honours `eq`, `is`, a two-clause `or`,
  `order` and `range`. Without it the live adapter could not run a suite that reads five
  companies by slug and expects five different answers — and a suite only the fixtures can
  pass is not a contract.

**Verified.**

- All three session-1 acceptance criteria pass against Postgres 16.
- `pnpm test` green across the monorepo (1,233 agents, 547 web, both data adapters).
- `pnpm turbo typecheck` and `pnpm turbo lint` green.

**Added after the dossiers landed** (still session 1's scope, unblocked by them):

- **`research_company_facts`**, which the reference DDL had no home for. `custody`,
  `accounting_treatment`, `mandate`, `covenants` and `operating_metric` are all seeded into
  `field_source_minimums` and none had a column, so five of the seven gated fields were
  unenforceable. A superseded claim is exempt from the gate and kept — the About page's
  self-custody claim has to be storable in order to be shown losing — and
  `v_company_facts` attaches it to the fact that beat it.
- **The Locate record, hand-entered** (`20260904010000_seed_locate_technologies.sql`), which
  is session 1's step 7 and session 2's diff baseline.

**Not done, and deliberately.**

- `packages/db/src/types/database.ts` is not regenerated — it needs the migration applied to
  the live project. The Supabase adapter reaches the new tables through boundary casts
  confined to named constants, the same pattern `research.ts` uses for `reports`. **Run
  `pnpm --filter @platform/db generate-types` once the migration lands on `main` and drop
  the casts.**
- No `apps/web` route, no `packages/ui` component, no page of any kind. That is session 3.

---

## Session 2 — ingest workflow

**Shipped.** `apps/agents/src/workflows/researchIngest/`, registered on the Mastra instance
as `researchIngest`. Ten steps: resolve → fetch → chunk and embed → **extract (Rex)** →
validate → reconcile → **score (Rex)** → **classify (Lex)** → persist → approval gate. The
three agent steps are in `MODEL_SCOPES` and configurable from `/settings/models`.

- **`numerics.ts`** — the deterministic validator. Every claimed figure is re-located in the
  source text by value rather than by string, so "A$1.0m" matches a claim of 1000000 and a
  claim of 6.089 against a document saying 6.08914 does not. Calibrated on the two secondary
  figures that got Locate's first purchase wrong: A$647,500 and US$667,000 are both rejected
  against the A$1,000,000 announcement.
- **`reconcile.ts`** — events against what is already committed, with the materiality floor.
  Calibrated on the real restatement: shares on issue restated by 90,539 against 307,378,078
  is 0.03%, suppressed and stored rather than dropped.
- **`documents.ts`** — resolution and retrieval, reusing `lib/reportWatch/` for HTTP, byte
  caps, the identified user agent and PDF extraction. It resolves registered documents; it
  does not discover them.
- **`commit_research_ingest`** — persist, in one transaction.

**Verified.**

- 52 unit tests across the four modules, plus `supabase/tests/research_ingest_persist.sql`
  against Postgres 16.
- Re-running the same payload commits zero new rows; a `company_web`-sourced event takes the
  whole commit down rather than committing the rows before it.
- A 404 records `retrieval_error` and the run continues.
- The gate suspends on `promoteToPublished` and passes straight through on ingest.

**Two decisions worth knowing about.**

1. **No venue announcement-URL templates ship.** The obvious design is announcement id in,
   PDF URL out, per venue. None has been verified against the venues, and a template guessed
   from training data produces a URL that 404s convincingly and fills `retrieval_error` with
   a fiction. A venue base is configuration (`RESEARCH_PDF_BASE_<VENUE>`, with `{id}`), and
   a venue without one resolves as `unresolved`. Every hand-entered document carries its own
   `pdf_url` and needs no template.
2. **All three agent steps fall back to nothing rather than throwing.** A malformed
   extraction is an empty extraction, a malformed scoring pass produces no findings, and a
   malformed classification classifies nothing — which leaves every field internal, the safe
   direction and the same one the view takes by default.

**Not done.**

- **The run against the real documents.** The acceptance criterion is to run the workflow
  over Locate's own filings and diff the output against the hand-entered record. That needs
  network access to the company's document directory and the venue announcement URLs, and a
  real model. Everything it depends on is in place: the documents are registered with their
  URLs, and `20260904010000_seed_locate_technologies.sql` is the baseline to diff against.
- **The recorded `TraceBundle` for the demo.** It must be recorded from a real run rather
  than authored, per the demo requirements, so it waits on the same thing. It goes in
  `packages/agent-traces`, whose schema is BTS-owned and must never import from
  `@mastra/core`. The recorded run needs to include the `validateNumerics` rejection and to
  end suspended at the gate — a trace where everything succeeds shows that the code runs; a
  trace with a caught error shows that the design works.
- **A routine to run it on a schedule.** `executeRoutineWorkflow` is the mechanism; no
  `routines` row is seeded, because the first runs should be watched.

## Session 3 — pages

Not started. `/research`, `/research/[slug]` and `/research/jurisdictions` in **`apps/web`**
(not `apps/hq`), with the components in `packages/ui` — where every shared presentational
component lives, and where `apps/demo` can reach them. Invoke the `bts-design` skill before
writing any of it, and read `company-page-sample.html` in this folder as the visual
reference.

The data layer is complete for it. Every read the pages need exists on
`CorporateHoldingsRepository` and both adapters pass the same suite:
`listCompanies`, `getCompany`, `getLedger`, `getPosition`, `getCompanyFacts` (the custody
conflict panel), `getJurisdictionNotes`, `getFreshness`, `getStructuralAbsences` and
`compareCompanies`, which throws `ArchetypeMismatchError` rather than returning a flag —
`packages/ui` catches it and renders the explanatory panel.

Still open from the spec, and all three are session 3 questions:

- **Scale control.** The register spans five orders of magnitude. Anything that ranks or
  charts across records without one renders the small Australian companies as rounding
  errors.
- **Peer-shaped matching.** `market_cap_band` + `funding_source` + `primary_archetype` is a
  first guess and wants testing against a fourth and fifth record.
- **The `is_fixture` guard.** The demo requirements call for the Supabase adapter's insert
  path to reject a fixture row. There is no insert path on this domain yet — it is read-only
  — so the guard has nothing to attach to. Add it with the first write method, not before.
