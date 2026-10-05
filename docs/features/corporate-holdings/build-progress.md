# Corporate Holdings — reconciliation and build progress

Reconciliation of the [`corporate-holdings`](./README.md) spec bundle against the live
repository, and a record of what each session shipped. Same purpose as
[`docs/features/demo-app/build-progress.md`](../demo-app/build-progress.md).

**Status:** Sessions 1–3 complete, one production fix (session 4), the register seeded to
three records (session 5), then to twelve, with step 1 of
[`schema-ingest-spec.md`](./schema-ingest-spec.md) built — sections and per-field source
sets (session 6) — then steps 2–4: identity, holdings vocabulary, absence and divergence
(session 7). Step 5 is under way: the event key is computed rather than asked of the
model, and the restated-ledger case is covered (session 8), then the eight read-side
conformance cases pass against both adapters (session 9), then SEC filings are split by
item and only accepted text reaches the extractor (session 10). What is left of step 5 is
operational: the first real run and its trace bundle. Step 6 is under way: record-level
`review_state`, the review queue and the subscriber summary (session 11), then Minute
shows the summary and `is_published` is dropped (session 12), then review state on
the rows themselves (session 13), then approval per ingest run and persist-and-stop
(session 14), then the weekly routine and its email (session 15), then "changed since
review" on records and rows (session 16). The first real run is next. Two things still remain
from session 2: the ingest run against real filings, and the recorded trace bundle.
**Last updated:** 2026-10-05


> **Superseded in part.** Records 4–12 (Strategy, Metaplanet, 333D, Hamak Strategy,
> Panther Metals, Angel Studios, RUM Group, Goodfood, Sequans) produced ~20 structural
> findings and a set of decisions taken on 29 September 2026 — per-field source
> allow-lists, `review_state` on records and rows, encumbrance, discovery via
> `reportWatch`, deterministic `natural_key`, and the Minute visibility bug. Those are
> in [`schema-ingest-spec.md`](./schema-ingest-spec.md), which is the current plan. Read it before
> this file. Sessions 1–5 below describe the state as at 11 September; session 6 is the
> first built against that spec.


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

**Shipped.** Components in `packages/ui`, pages in **`apps/web`** and `apps/demo` sharing
them. Written against the `bts-design` skill and `company-page-sample.html`.

Components (`packages/ui`):

- `ProvenanceRail` — `ProvenanceProvider`, `ProvenanceToggle`, `Cited`, `SourceBadge`. The
  citation travels with the fact rather than living in a bibliography, and `Cited` takes a
  non-optional source, so a page cannot render a figure without one and still typecheck.
  With the rail collapsed the citation is condensed, never removed — it stays in the
  accessibility tree.
- `BasisChip` — comparability read from the row, not inferred from the basis name. A fifth
  basis is expected.
- `ResearchLedger` — not a table. One DOM that stacks at 360px and becomes column-aligned at
  720px through grid template columns, so nothing is duplicated between the two layouts.
- `ResearchPanels` — `PositionPanel`, `FactPanel` (the custody conflict), `AbsencePanel`,
  `WithheldPanel`, `FreshnessStamp`.
- `ArchetypeComparison` — renders the explanation when the repository refuses, and a table
  when it does not.

Routes: `/research`, `/research/[slug]` and `/research/jurisdictions` in `apps/web`;
`/research` and `/research/[slug]` in `apps/demo` over fixtures, with five annotations and
two new principles in the architecture view.

**Verified.**

- **All three acceptance criteria.** The 360px criterion is checked in a real browser by
  `e2e/research-narrow.spec.ts` — arithmetically rather than by screenshot, so it needs no
  baseline and names the offending element when it fails. It asserts two things: the page
  does not scroll sideways, and no element escapes the viewport except inside a deliberate
  scroll container. Six cases, passing.
- The provenance rail and the archetype refusal are asserted in the component suites, and
  the register page's own test asserts that no bitcoin quantity appears anywhere on it.
- `pnpm test`, `turbo typecheck` and `turbo lint` green.

**One bug the screenshots caught that the tests did not.** `PositionPanel` labelled every
row in the asset's symbol, so a holding of 889,367 fund units rendered as "889,367 BTC" —
three orders of magnitude above the 194.85 the issuer states as its equivalent, and the
exact overstatement this feature exists to prevent, printed on the page that exists to
prevent it. The unit now comes from the instrument. There is a test for it now; there was
not one before, because every fixture the suite exercised happened to be spot.

**Still open from the spec.**

- **Scale control.** The register spans five orders of magnitude. Nothing ranks or charts
  across records yet, so the problem has not bitten — but the first element that does will
  render the small Australian companies as rounding errors unless it carries one.
- **Peer-shaped matching.** `market_cap_band` + `funding_source` + `primary_archetype` is
  still a first guess and wants testing against a fourth and fifth record.
- **The `is_fixture` guard.** The demo requirements call for the Supabase adapter's insert
  path to reject a fixture row. This domain has no insert path — it is read-only — so the
  guard has nothing to attach to. Add it with the first write method, not before.
- **Screenshot baselines.** `e2e/demo-surfaces.spec.ts` now lists the two research routes;
  their baselines need generating in the CI container image via
  `workflow_dispatch: update_baselines`. Until then those two cases skip, like every other
  one in that file.

---

## Session 4 — the company page error

`GET /research/<slug>` returned 200 and rendered "This page hit a snag". The 200 is why it
read as a mystery rather than as an error: `apps/web/app/(app)/error.tsx` catches a throw in
a server component, so Next streams the boundary rather than a 500 and the Vercel log shows
a successful request.

`v_company_position` was the only one of the four provenance views that did not project
`source_document_id`. It joins `research_documents d ON d.id = s.source_document_id` and then
never selects `d.id`, while `v_research_ledger`, `v_company_facts` and `v_research_absences`
all carry `d.id AS source_document_id` at the head of their provenance block. The adapter
maps all four through the same `toProvenance`, so `getPosition` asked Postgres for a column
that was not there and got 42703. Every company page was affected; the register was not,
because it reads the table.

**Shipped.** `supabase/migrations/20260905000000_position_view_source_document_id.sql` — the
view replaced rather than `CREATE OR REPLACE`d, because that form can only append columns and
the id belongs at the head of the provenance block like its three siblings.

**Why no test caught it.** The adapter's suite runs on `createFakeSupabase`, and
`__setDataset` accepts whatever columns a fixture invents — the position fixture spread the
same `source(...)` helper as the ledger one, so it supplied a column the real view does not
have. No mock can see a view definition, which makes this a class of bug the suite is
structurally blind to rather than an oversight in one case.
`packages/data-supabase/src/repositories/corporateHoldings.views.test.ts` closes it against
the only offline description of the real views there is: it reads `supabase/migrations/`,
takes each provenance view's last definition, and asserts the projection list carries every
column `toProvenance` maps. It is red on the unfixed schema and green on the fixed one.

**Verified.** `pnpm test` (13 packages, 2,355 tests) and `turbo typecheck` green.

---

## Session 5 — records 2 and 3 into the register

The register held one company. The three dossiers describe three, and the other two had
never been entered: `research_companies` had a single row, and no migration but
`20260904010000_seed_locate_technologies.sql` ever wrote to it. Records 2 and 3 were always
meant to arrive through `researchIngest`, which is still blocked on network access to real
filings — so the register stayed at one while the ingest run waited.

**Shipped.** `supabase/migrations/20260911000000_seed_digitalx_and_block.sql` — DigitalX
Limited (`digitalx`, regional, native exposure) and Block, Inc. (`block-inc`, bellwether,
operational integration), both `is_published = FALSE`. Identity, former names, listings,
documents, the facts the gate admits, and one structural absence. Eleven documents, eight
facts, five listings, one absence.

**No ledger, and that is the point.** No `treasury_events`, no
`treasury_holdings_snapshots` for either record. The ingest acceptance criterion is to run
the workflow over a company's filings and diff its output against a hand-entered record;
Locate is that baseline. Hand-entering two more ledgers would spend records 2 and 3 as
independent checks before the workflow has ever run — three hand-made records prove only
that the same pair of hands made all three. The quantities wait for the run meant to
produce them.

It is also what the dossiers support. Neither record has a quantity that could be entered
honestly: DigitalX's "364 BTC" headline carries no stated basis and sits between its own
308.8 direct and 503.7 look-through figures, and Block's 28,355 BTC is corporate treasury
plus customer assets held via Cash App, of which only 8,997.89 is the company's. Both need
`basis` vocabulary that does not exist yet — `stated_unreconciled` and a value for customer
assets held alongside corporate treasury.

### What the source-class gate refused

Four claims could not be stored as facts. Each is in `curator_notes` with its provenance,
and the document it came from is registered so the claim has a visible home — the same
shape as Locate's Treasury Management Policy, registered and populating nothing.

| Claim | Source | Rank vs required |
|---|---|---|
| DigitalX's 17 Feb 1999 ASX listing date | third-party profile | 6 vs 5 (`identity`) |
| Block's ISIN, former tickers, FY2025 figures | encyclopaedia | 6 vs 5 (`identity`) |
| Block's ASU 2023-08 fair-value election | 10-K (`audited_accounts`) | 3 vs 2 (`accounting_treatment`) |
| Block's DCA purchase policy | Bitcoin Blueprint (`company_web`) | 5 vs 2 (`mandate`) |

All four refusals were executed against Postgres 16 rather than reasoned about; the first
three are asserted in the verification below.

`isin` is left NULL on Block's row rather than filled from an encyclopaedia. It is key
material, and the register resolves on registration numbers.

### One thing to decide: audited accounts cannot state an accounting treatment

The third row above is not a judgement about Block. `field_source_minimums` ranks
`audited_accounts` (3) below `exchange_announcement` (2) and sets `accounting_treatment`'s
minimum at 2 — so audited financial statements cannot populate an accounting-treatment
fact, while an unaudited quarterly can. For measurement bases that ordering looks inverted:
the 10-K is the authoritative source for an accounting election and is the one source the
gate refuses.

The cost is concrete. Two ASX-quoted bitcoin holders whose identical economic exposure
produces opposite earnings behaviour — Locate's AASB 138 revaluation routing gains to OCI
against Block's fair value through net income — is the strongest teaching point across the
three records, and it cannot be stored. DigitalX's Appendix 4E is an exchange announcement,
so that record does carry the fact its sibling cannot.

Not worked around. Changing a rank changes what every existing row may assert, and a gate
refusing a claim it should admit is a better failure than the reverse. The question is
whether `accounting_treatment`'s minimum should be 3, or whether the rank ordering should
place audited accounts above exchange announcements.

**Verified.** Against Postgres 16, with the base migration, the Locate seed and the
session-4 view fix applied first:

- The migration applies clean and is idempotent — re-running it changes no counts.
- Three companies across three tiers; `v_company_facts`, `v_research_absences` and
  `v_research_freshness` all return rows for the new records, and `v_company_position` and
  `v_research_ledger` return none, as intended.
- The three gate refusals above raise, each with the expected rank in the message.
- DigitalX reads stale (monthly cadence, 141 days since its latest document), which is the
  freshness stamp working: the dossier records two to four monthly disclosures and the June
  2026 quarterly as unreviewed.
- `pnpm test` (13 packages, 2,356 tests), `turbo typecheck` and `turbo lint` green.

**One test added.** `PositionPanel`'s empty branch had no coverage, because every fixture
the suite exercised had a position. It is now the live path for two of the three companies
in the register, so `ResearchPanels.test.tsx` asserts that a positionless record states no
holdings were sourced rather than rendering a bare `0 BTC` — a sourced-looking figure
meaning the company holds nothing, which is a different and wrong claim. Confirmed red
against a mutation of the branch.

**Not done.** Everything session 2 listed still stands: the ingest run against real
documents, the recorded `TraceBundle`, and a `routines` row to schedule it. This session
moved none of them — it removed the reason the register was empty while they wait. The
local Postgres harness stubs pgvector, which the container lacks; no vector column is
touched by this seed.

---

## Session 6 — records 4–12 seeded, and the gate ranks by filing item

Built against [`schema-ingest-spec.md`](./schema-ingest-spec.md): its "do this first" seed
migration, and step 1 (Decisions 1 and 2). Branch `claude/corporate-schema-ingest`.

**Shipped.**

- **The spec, corrected.** Renamed from `corporate-schema-injest-spec.md.md`. Decisions 1–2
  marked as superseded by the per-field sets, the record counts fixed (twelve, not eleven),
  the claim that nothing writes `is_published` corrected (the `researchIngest` resume
  branch does), and the AR licensing premise removed — BTS holds no AFS authorisation.
- **The dump script, fixed before first use.** Moved to `packages/db/src/seeds/`, with the
  SQL emission split into a pure, tested `registerSeed.ts`. Against the live schema the
  uploaded version would have failed outright — its `company_listings` `ON CONFLICT` named
  no matching constraint, since the unique key includes `listed_from` — and silently
  dropped `research_findings.event_id`, which Strategy and Metaplanet both use. It now
  emits `INSERT … WHERE NOT EXISTS` with NULL-safe keys, resolves documents, sections and
  events by natural key, and throws on any column it does not know about rather than
  dropping it. `tsx` added to `packages/db`, which `seed:brand-voice` also lacked.
- **`20261001010949_seed_register_records_4_to_12.sql`** — generated from the live database:
  138 inserts across nine records, matching live table by table. A no-op against live.
- **`20261001030000_source_sections_and_allowed_classes.sql`** — `field_source_classes`
  replaces `min_source_rank` with a set per field; `filed_financials` and `filed_narrative`
  added and kept apart (decided 1 October), so the ledger accepts a 10-Q's notes and refuses
  10-K prose while custody accepts both; `investor_presentation` becomes
  `furnished_release`; `research_document_sections` plus a nullable `source_section_id` on
  facts, events and snapshots, with the gate using the cited section's class and refusing a
  section from another document; the three views report it. The six forced-fit 10-Qs
  (Angel Studios, RUM Group) become `filed_financials`.
- `ProvenanceRail` flags against the ledger's set rather than `rank > 2`, so audited accounts
  stop reading as below the ledger's class. The conformance case and the SQL acceptance test
  follow the rename, and the acceptance test gains criterion 4 for sections.

**Session 5's open question, answered.** Audited accounts are now in
`accounting_treatment`'s set, so Block's ASU 2023-08 election is storable. It has not been
re-entered — see below.

**Verified.**

- The seed: replayed into a fresh database (twelve records, counts and checksums identical
  to live) and re-run to insert nothing.
- The source migration: run against the live database inside one `DO` block that ends in a
  deliberate exception, so it could not commit. The acceptance test passed all four
  criteria, every stored claim on the twelve records passed the new sets, and the
  reclassification landed as expected. A follow-up read confirmed live was unchanged. Not
  yet replayed on a fresh database after the seed.
- `pnpm test` (16 packages), `turbo typecheck` and `turbo lint` green.

**Not done.**

- `jgaap`, the `jurisdiction_notes` seeds and `restricted_metrics`, which the spec puts in
  step 1's migration. Small; they go in their own.
- Sections for the registered 10-Ks, 10-Qs and 8-Ks, and re-entry of the refused claims in
  Decision 1's table. Both are live-database writes and need the migration applied first.
  Several 10-Q titles still say "class is a forced fit", which is no longer true.
- Regenerating `packages/db/src/types/database.ts` once the migration is applied.
- Steps 2–6 of the spec. Three questions are open before 5 and 6: row-level `review_state`
  as specified passes visibility into a repository read, which `ReadContext` forbids —
  internal and client visibility need to be separate bundles; where a company binding
  lives for discovery, since `report_watch_sources` does not exist and reportWatch reads
  `news_sources`; and Sequans' 817 BTC encumbered against "holds none".

---

## Session 7 — identity, holdings vocabulary, absence and divergence

Steps 2–4 of [`schema-ingest-spec.md`](./schema-ingest-spec.md), one migration each. Session
6's merge (#392) applied cleanly; its types regeneration landed on `main` separately.

**Shipped.**

- **`20261001100000_research_identity_and_calendars.sql`** — `company_identifiers`,
  backfilled from the five Australian-shaped columns (one ABN, one ARBN, one ISIN across the
  register). `jurisdiction` nullable with `jurisdiction_basis`; Hamak and RUM Group move from
  the string `unknown` to NULL with basis `unknown`. `company_listings.security_class`,
  `fiscal_calendar_type` (Goodfood's sentence leaves `financial_year_end`), `jgaap`
  (Metaplanet).
- **`20261001100100_research_holdings_vocabulary.sql`** — `etf_wrapped`; encumbrance as three
  snapshot columns; `cost_basis_convention`; `holding_status` + `exited_on` (Sequans);
  `restricted_metrics`.
- **`20261001100200_research_absence_and_divergence.sql`** — `ledger_absence_reason` for the
  seven records without a ledger; `research_documents.resolution_status`; `secondary_claims`;
  `tracker_divergence`.
- **Read model.** `CompanyDossier.identifiers` replaces `acn`/`abn`/`arbn`/`isin`, and
  `RegisterEntry.jurisdiction` is nullable. Both adapters, the web record page (all
  identifiers, superseded ones dated), the register lists and `BasisChip` follow. The ingest
  writes `resolution_status`, distinguishing a document with no URL from a failed fetch.
- **Dump script** knows every new column, dumps `company_identifiers` and `secondary_claims`,
  and leaves the deprecated identifier columns behind.

**Departures from the spec, and why.**

- **Expand, then contract.** The identifier columns are copied, not dropped. Migrations apply
  on merge, before Vercel and Railway redeploy, so dropping a column the running app still
  selects breaks it for the length of the deploy. Nothing reads them after this PR; a later
  migration drops them.
- **No `pledged_collateral` basis.** The 29 September decision made encumbrance a flag. The
  step-3 list predates it.
- **No `asset_class` on snapshots.** They already carry `asset`, defaulting to `btc`.
- **Metaplanet's long URL is `resolved`, not `unfetchable`.** The 250-character limit the spec
  cites belonged to the research tool; the ingest's fetcher has none.
- **`jurisdiction_notes` seeds not written.** They are accounting and listing-rule claims
  (Japanese GAAP against AASB 136, ASX LR 11.1, the ASU 2023-08 principal market, UK
  depositary interests) and need a researcher's primary sources, not a migration author's.

**Verified.**

- All three migrations run against live inside one self-aborting `DO` block, with checks that
  each new constraint refuses what it should and accepts what it should. That run caught a
  real bug: the jurisdiction check was `jurisdiction_basis = 'unknown'`, which is NULL — and so
  passes — when both columns are NULL. Fixed to `IS NOT DISTINCT FROM`. Every backfill landed
  on the intended rows, and a follow-up read confirmed live was unchanged.
- `pnpm test` (16 packages), `turbo typecheck` (17) and `turbo lint` green.

**Not done.**

- ~~Drop `research_companies.acn`/`abn`/`arbn`/`isin`/`lei` once this has deployed.~~ Done in
  `20261001120000`, which also moves their no-two-companies guarantee to a unique index on
  `company_identifiers(scheme, value)`.
- `security_class` on existing listings, `holding_status` beyond Sequans, CIKs and other
  identifiers for records 4–12 — all research data, entered against sources.
- Surfacing the new fields on the pages: absence reasons, holding status, encumbrance,
  tracker divergence. That is step 6's panel work.
- Session 6's data follow-up still stands: sections for registered filings, and re-entry of
  the refused claims.

---

## Session 8 — the event key, computed

The part of step 5 the spec says must land before the first real run. An unstable
`natural_key` reconciles as new and duplicates the ledger row.

**Shipped.**

- **`researchIngest/naturalKey.ts`.** Rex now returns type, date and quantity, with no key.
  The extract step builds `<slug>:<code>:<YYYY-MM-DD>` from the slug on the record and a
  fixed code per event type (`EVENT_KEY_CODES`, the codes the seeded keys already use).
  Restatements collapse: one type and date in several documents is one event. Only when a
  single document states several same-type events on one date are they keyed apart, by a
  short hash of the quantity, plus an ordinal where the quantity repeats too. Two
  documents that disagree about one event keep the last one and log the conflict.
  Reconcile then measures it against the committed row.
- **Dates are checked before persist.** A candidate whose date is not a real `YYYY-MM-DD`
  is dropped and logged. Before this it failed the `DATE` cast inside
  `commit_research_ingest` and took the whole run's transaction down with it.
- **The extraction prompt** states the date rule: the day the event happened, the last day
  of the period for a period event, never the filing or signature date. Extracting every
  row of a restated history table is expected.
- **`20261002000000_canonical_event_natural_keys.sql`** rewrites the twelve committed keys
  not already in that form: the `loc`, `hamak` and `panther` prefixes, two month-only dates
  and `loc:accounting:aasb138`. It skips any row whose canonical key another event already
  holds, and none does today.
- **Tests.** `naturalKey.test.ts` covers the seeded Strategy keys reproduced exactly,
  prefix drift, same-day pairs, restatement collapse and conflicts. It also carries the
  spec's `restatedLedgerIsIdempotent` case: a sixty-row history (plus one same-day pair)
  ingested from two notices commits nothing new and reads as a quiet run. The workflow
  test asserts that a key the model offers is ignored, and that a bad date drops one row
  rather than the run.

**Departures from the spec, and why.**

- **The hash covers quantity, not quantity plus source document.** With the document in the
  key, every quarterly notice that republishes Metaplanet's history would give the same
  purchase a new key. That is the duplication the case exists to prevent.
- **Period events key on the period's last day.** The spec's date paragraph says "date of
  earliest event reported", but every seeded period event is keyed on the period end
  (`strategy:disp:2026-08-02` for 27 July – 2 August). A different rule would duplicate
  them on the first run.
- **No Strategy rounding test yet.** The stored totals (847,363 → 846,000 → 843,775 →
  840,447 → 845,050) agree exactly with the stored flows, so the two off-by-one filed
  figures are not in the database. They need reading from the 8-Ks rather than inventing.
  `validateClaims` checks presence, not arithmetic, so it already accepts a filed
  "approximately" total. What is missing is the test that says so with real numbers.
- **No date check in `validateNumerics`.** The signature-date trap is a choice between two
  dates that both appear in the text, so a presence check cannot catch it. It is handled
  by the prompt rule above. A deterministic check would need the 8-K cover page's "Date
  of Report" parsed, which belongs with the item-aware EDGAR parsing.

**Verified.**

- The migration ran against live inside a self-aborting `DO` block: twelve rows
  rewritten, zero left outside `^<slug>:[a-z]+:YYYY-MM-DD$`, then rolled back.
- `pnpm --filter @platform/agents test` (1,351) and `turbo typecheck lint` for the agents
  package green.

**Not done.**

- **The eight read-side conformance cases.** These are `flowsReverseWhileStockIsFlat`,
  `currencyOnlyDisclosureYieldsNoSnapshot`, `etfWrapperIsNotComparable`,
  `encumberedPortionExcludedFromFreeBalance`, `refusedByClassIsDistinguishableFromAbsent`,
  `trackerDivergenceRaisesFinding`, `exitedIsNotAbsent` and `disposalWithoutConsideration`.
  `CorporateHoldingsRepository` does not yet return absence reasons, holding status,
  encumbrance or secondary claims. Each case needs those fields in the read model, a
  scenario slot, live and fixture data to satisfy it, and for tracker divergence a
  computation that does not exist yet.
- Finding keys are still written by the model in the score step. The spec only named
  events, but the same drift applies.
- Venue adapters, item-aware EDGAR parsing, the first real run.

---

## Session 9 — the read-side conformance cases

The eight cases from [the spec's conformance table](./schema-ingest-spec.md#conformance-cases)
that test what the company page reads. Each needed a field the repository did not
return, so this is read-model work as much as test work.

**Shipped.**

- **Read model.** `CompanyDossier` gains `ledgerAbsenceReason`, `holdingStatus` and
  `exitedOn`. `PositionRow` gains `encumberedQuantity`, `encumbranceCounterparty` and
  `encumbranceObligation`. `PositionSummary` gains `unencumberedTotal`, decided by the
  adapter like `comparableTotal` is. A new `getTrackerClaims` returns `secondary_claims`,
  each measured against the comparable position. The measuring is done by
  `measureTrackerClaim` in `@platform/data`, so both adapters apply one rule: signed
  divergence relative to the sourced figure, material at or above `MATERIALITY_FLOOR`.
- **`20261002100000_position_view_encumbrance.sql`.** `v_company_position` now selects the
  three encumbrance columns. Session 7 added them to the snapshots table, but the view never
  selected them. The definition is otherwise unchanged, with the new columns appended.
- **Suite.** Nine new scenario slots and ten cases in
  `packages/data/src/testing/corporateHoldings.ts`: the spec's eight, plus a control for
  each of encumbrance and tracker divergence. Without the controls, an adapter flagging
  everything would pass.
- **Fixtures.** Four new demo records for states the first five could not show:
  - Halden: ETF units.
  - Corran: holdings stated only in currency.
  - Ashby: claims only on its own website, refused by source class.
  - Wexford: exited, with a disposal stating a quantity and nothing else.

  On existing records:
  - Verrall gains a purchase and a sale, and carries the tracker claims. It is the record
    whose mixed bases make "measured against the comparable total" testable.
  - Calder gains a pledge against a term loan.

  The Supabase adapter's test dataset mirrors the same slugs.

**Verified the way `CLAUDE.md` asks.** Each rule was broken deliberately, one at a time,
to check the suite catches it:
- **Fixture adapter and shared helper: eleven breakages.** These were:
  - an unencumbered total that ignores the pledge;
  - every claim material, and no claim material;
  - ETF units summed into the total, or dropped from `excluded`;
  - the absence reason dropped, or collapsed to one reason for every empty record;
  - a zero balance read as active;
  - disposals netted out of the ledger;
  - a missing consideration filled with zero;
  - a claim measured against every row.
- **Supabase adapter's own mapping and select: eight breakages.**

All nineteen go red. One did not at first: measuring a claim against every row passed
while the claims sat on Meridian, whose position has a single row. Moving them to Verrall
is what caught it.

The view migration ran against live inside a self-aborting `DO` block. The column list
before matched 20261001030000 exactly, the three columns were appended, and row count was
unchanged (5 → 5). `pnpm test` (16 packages), `turbo typecheck` and `turbo lint` green.

**Departures from the spec, and why.**

- **"Raises a finding" is a computed divergence, not a `research_findings` row.** Nothing
  writes `tracker_divergence` findings yet. The read model reports each claim with its
  divergence and whether it clears the floor, which is what a finding would be written
  from. Persisting one is ingest work, for when trackers are recorded during a run.
- **`flowsReverseWhileStockIsFlat` asserts flows, not endpoints.** The position read returns only the
  latest snapshot, so the case asserts what the ledger alone can show: gross purchases and
  sales well beyond their net.

**Not done.**

- **None of the new fields render yet.** Absence reasons, holding status, encumbrance and
  tracker claims are on the read model and on no page. That is step 6's panel work.
  Tracker claims are internal-only by their nature and need no client path.
- **Live data is thin.** Wexford-shaped and Halden-shaped states exist live (Sequans,
  Goodfood). But no live snapshot carries an encumbrance yet, and `secondary_claims` is
  empty: Panther's pledge and RUM Group's tracker figures are research entries still to
  make.
- **The four new fixture names have not been searched against a companies register**,
  the same caveat `entities.ts` carries for the first five.

---

## Session 10 — item-aware EDGAR parsing, and what the extractor may read

The code that remained of step 5. The spec's "ingest adapters" turned out to be mostly
not code:
- Every SEC, LSE and TDnet document registered has its own URL and resolves today.
- The documents that do not resolve are ASX and NZX announcements with no URL (DigitalX,
  Locate, Block). The spec already says an ASX id is not derivable, so those need a
  researcher to find each document's URL, not a URL template.
- SEDAR+ blocks fetching outright and still needs its own adapter. No registered document
  points at it.

What did need building was the SEC side, and it turned up a blocker for the first run.

**The blocker.** `commit_research_ingest` never passed `source_section_id`. So every
ingested event was judged by its whole document's class, and the source-class trigger
*raises* on a refused class rather than skipping the row. Two consequences:
- Strategy's documents include a secondary news article, so one event Rex extracted from
  it would have failed the whole commit.
- An event read from a 10-K's MD&A would have been accepted, because the document is
  classed `audited_accounts`.

**Shipped.**

- **`edgarSections.ts`** splits an 8-K, 10-K or 10-Q on its item headings, using
  line-start string matching and no model.
  - **8-K:** Items 2.02 and 7.01 are `furnished_release`; the rest are
    `exchange_announcement`.
  - **10-K:** Item 8 is `audited_accounts`; everything else is `filed_narrative`.
  - **10-Q:** Part I Item 1 is `filed_financials`; MD&A and Part II are
    `filed_narrative`.
  - The table of contents is skipped by starting at the body's "PART I". The first
    occurrence of each item in the body wins, so a running page header cannot hand the
    start of the financial statements to Item 7A. The cover page and signature block are
    excluded, which keeps the "June 29, 2026" signature-date trap away from the
    extractor.
- **`readingUnits.ts`** decides what Rex reads.
  - Only documents at venue `sec` are split. A news article that mentions a Form 10-K is
    never split into sections classed as filed.
  - Splitting stores each item in `research_document_sections`. Rows already there are
    left alone, so a hand classification wins.
  - Only units whose class is in `field_source_classes` for `ledger_event` reach the
    extractor. The set is read from the table the trigger reads, so the two cannot
    disagree. An empty set fails the run rather than reading nothing and reporting a
    quiet week.
- **The workflow** gains a `split_sections` step and now has eleven steps. Each candidate
  carries `source_section_id`, set from the unit being read, never by the model. Numeric
  validation checks each figure against the item it was read from, not the whole filing.
- **`20261002200000_commit_ingest_source_section.sql`** adds `source_section_id` to the
  event insert and update. It is generated from 20260904000000's body, which matched
  live byte for byte by md5 before the change.
- `apps/agents/README.md` lists the new step and two more load-bearing rules: the
  extractor reads only what the ledger accepts, and event keys are computed.

**Verified.**

- 15 splitter tests, built on markdown shaped as the HTML step emits EDGAR filings. They
  cover the table of contents, a running header, a mid-sentence cross-reference, Part I
  and Part II both having an Item 1, and the cover-page and signature traps. Plus 4
  reading-unit tests and 4 workflow tests:
  - only Item 8.01 of an 8-K is read, and the event cites it;
  - the sections are upserted without overwriting existing rows;
  - a secondary document is never read;
  - an empty accepted set fails the run.
- The migration was dry-run against live inside a self-aborting block. An event citing a
  filed section stored that section id. An event citing a furnished section was refused
  by the gate. The dry run replaced the function with its events loop only, which is the
  part that changed; the rest of the migration's body is the original, unchanged.
- `pnpm --filter @platform/agents test` (1,376), typecheck and lint green.

**Not verified: real filing text.** This container's network policy refuses `sec.gov`,
so the splitter has not seen a real EDGAR document. The heading patterns are EDGAR's
standard layout as the HTML step converts it. The first real run is where that gets
checked: a filing that yields no sections falls back to being read whole under its
document's class, which is the behaviour before this session.

**Not done, and why.**

- **Scheduling is deliberately not added.** Strategy, Metaplanet, Locate and Sequans are
  `client_cleared`. A scheduled run would commit model-extracted, Lex-classified rows
  onto them with no human between extraction and the register. The spec puts scheduling
  after the review queue ("once the above exists"), and that queue is step 6.
- **The first real run has not happened.** It needs the agents server's model keys and
  SEC access, neither of which this container has. Mastra serves registered workflows over
  its API, so it can be started on Railway with
  `POST /api/workflows/researchIngest/start-async` and a body of
  `{ "inputData": { "companyId": "<uuid>" } }`. With `TRACE_RECORDER_TRACE_ID` set, the
  same run produces the trace bundle.
  - **Target RUM Group or Angel Studios, not Strategy.** Both have SEC 10-Qs and neither
    is client-cleared. Strategy is client-cleared, so its first run belongs after
    step 6.

## Session 11 — review state on records, and the summary a subscriber reads

The record-level half of step 6. `is_published` read as outward and meant inward: it put a
record on the internal register. Nothing separated a record an agent had just created from
one a human had read, and the ingest's approval gate set the same flag a seed did.

**Shipped.**

- **`20261003200000_research_review_state.sql`** (expand only; `is_published` stays until
  a later migration drops it).
  - Adds `review_state` (`draft` → `internal` → `retired`, default `draft`),
    `reviewed_by`, `reviewed_at` and `client_summary` to `research_companies`.
  - Backfills the twelve records. The three hand-seeded ones (Locate, DigitalX, Block)
    and every client-cleared one become `internal`. The other six stay `draft`.
  - **Revokes six clearances.** Clearance now needs a written summary, and none of the
    six cleared records had one: Locate, DigitalX, Block, Strategy, Metaplanet and
    Sequans. They are withheld from Minute until someone writes one.
  - `client_clearance_needs_review` enforces it in the schema: a cleared record is
    `internal` with a non-blank summary.
  - The four client read policies and `v_research_publishable` read
    `review_state = 'internal'` instead of `is_published`. The view is restated
    `WITH (security_invoker = true)`, because `CREATE OR REPLACE VIEW` drops it. The
    timestamp sorts after everything on `main`, so the guard in `migrations.test.ts`
    sees the redefinition last.
- **Read model.** `RegisterEntry.reviewState`, `CompanyDossier.clientSummary` (replacing
  `isPublished`), and `RegisterFilter.reviewState`, which defaults to `internal`. The
  review queue is the register filtered to `draft`. Both adapters push the filter down.
  Minute's register repository reads `review_state = 'internal'`.
- **Four contract cases**, against a new `draftSlug` scenario slot:
  - the default register lists only reviewed records;
  - the draft filter returns only drafts;
  - a draft's publishable read is empty while its full ledger carries publishable rows;
  - every cleared record is `internal` with a summary.
- **`/research`** has a To review view with its count on the tab. A company page shows
  the review control first. The subscriber gate appears only on a reviewed record, and
  clearing asks for the summary. `setReviewState` records who reviewed it. Moving a record
  out of `internal` withholds it in the same write: that is the safe direction, and the
  alternative is a constraint error the person cannot act on.
- **The ingest approval gate** writes `review_state = 'internal'` with the approver, never
  clearance. The seed dumper lands records as `draft` and never carries review state,
  clearance or summary.
- Minute's empty register no longer says "cleared for distribution". Distribution is the
  wrong word for a register that reports.

**Verified.**

- The conformance suite was broken deliberately, seven ways, and caught each one:
  - **Fixture adapter (4):** no default filter, draft filter ignored, the publishable
    read ignoring review, and a cleared record with no summary.
  - **Supabase adapter (3):** no default filter, `reviewState` not mapped, and
    `clientSummary` not mapped.
- The first choice of draft fixture, Nyala, failed the publishable case honestly. Its one
  ledger row is internal, so an empty publishable read proved nothing. The draft is now a
  new record, Brennock Packaging, with one publishable row, in both datasets.
- The final migration was dry-run against live inside self-aborting blocks.
  - **Records:** 6 internal and 6 draft, with 0 cleared.
  - **The view:** it carries `security_invoker=true` and returns 8 publishable rows,
    none from a draft.
  - **Reads by role:** anon sees no records, and the Minute subscriber sees none either,
    because every clearance was revoked. A team member sees all 12.
  - **The review-then-clear path:** a team member reviewing RUM Group and clearing it
    with a summary makes it the one record the subscriber sees. Returning it to draft
    while cleared is refused.
  - **How the policies were tested:** with `ALTER POLICY` and the same `USING`
    expressions, because the SQL tool holds any statement containing `DROP` for a
    confirmation.
- The control was rendered at 375px and 320px. There is no horizontal scroll and every
  target is 44px. `ClientGate`'s buttons gained the 44px rule and wrap, since at 320px
  they did not fit side by side.
- `pnpm test` (16 packages), `turbo typecheck lint` and the doc-link check are green.

**The demo register is unchanged.** It reads the fixture adapter, so making an existing
record the draft would have removed it from the demo. Brennock exists only to be the
draft, and a fixture test asserts that every other staged record stays on the list.

**Not done.**

- Row-level `review_state` on events and findings, and the queue for them.
- Notifications when a draft lands.
- Minute does not yet show `client_summary`. That is a change to the client contract and
  both of its adapters.
- The migration that drops `is_published` from `research_companies`. It runs after this
  one is deployed and nothing reads the column. The seed dumper's ignore list drops it in
  the same change.
- The ingest workflow still names its gate `publish` and its flag `promoteToPublished`.
  Renaming them changes the resume payload of any suspended run.

## Session 12 — Minute shows the summary, and `is_published` goes

Two follow-ups from session 11.

**Shipped.**

- **Minute shows the summary.**
  - `ClientRegisterEntry.summary` carries `client_summary`. The live adapter selects the
    column by name, and the internal `curator_notes` are never selected.
  - The entry page opens with the summary, under the name. An entry without one renders
    nothing in its place.
  - The client fixture carries an implementation-facts summary, so the fixture adapter
    serves the same shape.
- **`20261003210000_drop_research_companies_is_published.sql`** is the contract half of
  `20261003200000`. Before writing it, I checked live: no view, policy, function or index
  depended on the column, and no code read it. `jurisdiction_notes.is_published` is a
  different column and stays. The seed dumper no longer lists the column, and `schema.sql`
  describes `review_state`.

**Not a contract case.** "Every served entry has a summary" would pass vacuously against
the live adapter's contract run, whose register is empty. So it is an adapter test that
seeds a row and checks both the mapping and the selected columns.

**Not done.** The ingest drafting the summary for a human to edit (decided 29 September,
see [`schema-ingest-spec.md`](./schema-ingest-spec.md)). Until it exists, every summary is
written from scratch on the record's page.

## Session 13 — review state on the rows

The row-level half of step 6, as decided on 29 September. A record-level flag can't say
that one new event on a settled record is unread. Either the whole record drops back to
draft, hiding everything because one row arrived, or the row is served unreviewed.

**Shipped.**

- **`20261003220000_row_review_state.sql`**:
  - Adds `review_state` (default `draft`), `reviewed_by` and `reviewed_at` to
    `treasury_events`, `research_findings` and `research_company_facts`. Existing rows
    inherit their company's state.
  - The client read policies on events and facts check the row as well as the record.
  - `v_research_publishable` requires a reviewed row. The internal views carry
    `review_state` and drop retired rows.
  - `v_research_review_queue` lists every record with something waiting.
  - All five views are restated `WITH (security_invoker = true)`.
- **`commit_research_ingest` sends a row back to draft only when a fact in it
  changed**: type, asset, date, quantity, consideration, currency, fees or basis
  (for findings, their own factual columns). Every run re-sends every validated event,
  so resetting on any update would demote the whole ledger weekly.
  - An unchanged re-read also keeps the reviewed headline and detail, because the
    model rewords them on every run, and that rewording must not reach a subscriber
    unreviewed.
  - A changed row takes the new text and needs reviewing again.
- **Read model:**
  - `LedgerEntry`, `CompanyFact` and `StructuralAbsence` carry `reviewState`.
  - `getLedger`, `getCompanyFacts` and `getStructuralAbsences` take `includeDrafts`,
    and return reviewed rows by default. Retired rows are never returned.
  - `getReviewQueue` lists what is waiting, with draft counts per record.
- **Three contract cases**, against a new `draftRowSlug` slot (Meridian: a reviewed,
  cleared record with a draft row Lex classified publishable):
  - reviewed rows by default, and drafts only when asked;
  - no draft row in the publishable read;
  - the queue lists every record with something waiting, and nothing else.
- **`/research`:**
  - The company page reads the reviewer's view and marks draft rows. The marker is a
    dashed rule, in `@platform/ui`'s ledger and fact and absence panels.
  - `approveDraftRows` approves them all, recording who did.
  - The To review tab lists the queue and says what each record waits on: "New
    record", or "1 draft ledger event · 2 draft facts".
- **Ingest approval gate:** also approves the record's draft events and findings.
- **Seed dumper:** ignores the row review columns, so seeded rows land as drafts.
- **Generated types:** `packages/db/src/types/database.ts` gains the nine new columns,
  hand-added so the web action typechecks before the migrate workflow regenerates
  the file.

**Verified.**

- **Dry run on live**, inside a self-aborting block:
  - Backfill: 26 events, 7 findings and 24 facts became `internal`. 3 events,
    4 findings and 14 facts stayed draft.
  - Publishable rows stayed at 8, and the queue listed the 6 draft records.
  - Re-sending Sequans' disposal unchanged, with a reworded headline, kept it
    `internal` with its reviewed headline. Re-sending it with a changed quantity sent it
    to draft with the new text, and put Sequans in the queue.
  - With Sequans cleared, a Minute subscriber saw its one reviewed event and not the
    draft.
  - Policies were tested with `ALTER POLICY` and the same expressions, because the SQL
    tool holds back statements containing `DROP`. The function was trimmed to its events
    loop for the dry run; the findings loop follows the same pattern.
- **Deliberate breaks:** I broke the adapters nine ways, and the suite caught eight.
  The one it missed was the Supabase adapter's own internal-only filter on the
  publishable read. Its test data mirrors the view, which already applies that filter,
  so the contract could not see the adapter's copy. An adapter wiring test now checks
  that query, and catches the same break.
- The control renders at 375px and 320px with no horizontal scroll and 44px targets.

**Not done.**

- **Approval is per record, not per run.** Rows carry no run id, so approving a run
  approves every draft row on its record. The spec's run-based queue, backed by
  `agent_activity` and approving exactly what a run produced, comes next.
- **The workflow still ends in `suspend()`.** Persist-and-stop, notifications and
  scheduling follow the queue.
- **Positions (`treasury_holdings_snapshots`) carry no review state.** The spec names the
  three row tables only.

## Session 14 — approve a run, and stop instead of suspending

Session 13 left approval per record: rows carried no run id, so approving a run approved
every draft row on its record. This session closes that gap, and replaces the workflow's
suspend gate with persist-and-stop, as the spec asks ("Replace the suspend gate with a
review queue").

**Shipped.**

- **`20261004000000_ingest_run_id.sql`** adds `ingest_run_id` to `treasury_events` and
  `research_findings`.
  - `commit_research_ingest` stamps it from `payload.run_id`.
  - A row whose facts a later run changes takes that run's id along with its draft
    state: the run that changed it owns its review. An unchanged re-read keeps the row's
    run, state and wording.
  - `v_research_ledger` and `v_research_absences` carry the column, restated
    `security_invoker`. Facts get no run id, because the ingest writes none.
- **Read model:** `LedgerEntry` and `StructuralAbsence` carry `ingestRunId`.
  - A contract case: the draft row on `draftRowSlug` names its run, and every row carries
    the field.
  - An adapter wiring test checks the select names `review_state` and `ingest_run_id`.
    The fake returns whole rows whatever is selected, so the data cases cannot see a
    dropped column.
- **The workflow persists and stops.** The `approval_gate` step and `promoteToPublished`
  are gone, replaced by `record_run`.
  - Persist passes the Mastra `runId` as the payload's `run_id`.
  - `record_run` counts the draft rows stamped with its run, and returns them as
    `queuedRows`. The commit's own tallies count unchanged re-reads as updates, so they
    could not say what is waiting.
  - It logs the run to `agent_activity` as `rex` / `research_ingest`, with status
    `auto`.
- **Why `auto`, when the spec suggested `agent_activity` as the queue's backing table:**
  a `pending` row would appear in the generic approvals list, and its approve button only
  changes the activity's status. The rows would stay drafts, and two approve paths for
  one run would disagree. The run id on the rows gives the queue its run identity
  instead. The activity row stays the audit trail, and approving the run on `/research`
  marks it `approved` with who and when.
- **`/research`:** a record's draft rows are grouped by run, "Ingest run 3f9c2a1b · 4
  rows", each with its own approve. Hand-written rows, including every draft fact, form
  their own group.
  - `approveDraftRows(companyId, runId)` approves one group. For a run, it also marks
    that run's activity row approved.
- **Generated types:** `ingest_run_id` is hand-added to `database.ts` until the migrate
  workflow regenerates it.

**Verified.**

- **Dry run on live**, inside a self-aborting block, with the function trimmed for the
  run:
  - A changed fact under run A went to draft, owned by A.
  - An unchanged re-read under run B kept it owned by A.
  - A new event and a new finding under B were drafts owned by B.
  - A call with no run id wrote NULL.
  - Both views still run as the caller, and publishable rows stayed at 8.
- **Deliberate breaks:** three. The suite caught two. The third, dropping the column from
  the select, was invisible to the fake until the wiring test above was added; it is
  caught now.
- `pnpm test` passes in every package; typecheck and lint are green. The grouped control
  renders at 375px and 320px with no horizontal scroll and 44px targets.
- The first CI run on the PR failed in `researchMailListener.test.ts`, which this session
  does not touch. One test hit vitest's 10-second timeout, and the next read its leftover
  calls. The same file passed on `main` and three times in a row locally. If it recurs,
  it is a flake in that listener's tests to investigate on its own.

**Not done.**

- Notifications (the dashboard card and the `sendReviewQueueDigest` email).
- Scheduling: the `routines` row and `researchIngest/run.ts`.
- The first real run, which needs the agents server's model keys and SEC access.

## Session 15 — the weekly routine, and the email when something is waiting

The two items left after session 14. With them, every part of step 6's queue design is
built.

**Shipped.**

- **`20261004010000_research_ingest_routine.sql`** adds `research_ingest` to
  `routines.action_type` and seeds "Weekly corporate research ingest" (weekly, 06:45
  Melbourne, `rex`, dashboard title "Corporate research review").
  - It is seeded **inactive**. No run has fetched a real filing yet, so the first run is
    started by hand and watched, and the schedule is switched on from `/routines`.
- **`researchIngest/run.ts`:**
  - `startResearchIngestRun` starts one run and waits for it, loading Mastra lazily as
    `variant/run.ts` does.
  - `runResearchIngestRoutine` runs every record that is not retired, in sequence.
  - A record whose run throws or doesn't finish is named in the summary and skipped.
    The rest still run, and the routine still succeeds.
- **The email**, `sendReviewQueueDigest` and `reviewQueueEmail.ts`:
  - One message per routine run, through the shared `deliverTeamEmail` transport, to
    the same recipients as the news digest.
  - It names each record with draft rows, links each one, and links the queue.
  - It carries no figure from the rows, which are unread drafts. Nothing is sent when
    nothing is waiting.
- **The dashboard card** is the routine's own tile.
  - The result's summary reads, for example, "4 rows waiting for review on 2 records:
    …".
  - `RoutineTile` gained a generic `metadata.link_url` / `link_label` footer link,
    pointing at `/research?view=review`.
  - The dashboard lists active routines with a result, so the card appears after the
    first scheduled run.
- **The routines form and server action** accept the type, which has no settings.

**Not built.** Signal alerts for the two interrupting cases the spec names: a numeric
validation failure, and a reconcile delta on a record already cleared to subscribers.

**Verified.** Tests cover:
- the renderer (subject, links, escaping, no figures);
- the sender (silent when nothing is waiting, and only the waiting records named);
- the routine (every record in order, a failure skipped and named, an unfinished run
  counted as failed, the quiet summary, and a legal name's own full stop not doubled);
- the tile's link;
- the form round trip for the new type.

`pnpm test` passes in every package, and typecheck and lint are green.

**Not done.** The first real run. It needs the agents server's model keys and SEC
access. Start it on Railway with `POST /api/workflows/researchIngest/start-async`,
body `{ "inputData": { "companyId": "<uuid>" } }`, against RUM Group or Angel Studios.
Then read the drafts on `/research` and switch the routine on.

## Session 16 — changed since review

A reviewed record kept saying "reviewed" after its content was edited. On 5 October,
direct SQL rewrote 333D's curator notes, tier and client summary. The record stayed
`internal` with its old `reviewed_at`, so its badge vouched for text nobody had read.
The rows have the same exposure. The rule: a substantive edit after review shows as
"changed since review", and review and clearance actions do not trigger it.

**Decided:** flag, not auto-demote. A changed record or row keeps its state and stays on
the register, cleared or not, until someone reads it again. Demoting would also have to
revoke clearance in the same write, or `client_clearance_needs_review` rejects the edit.

**Shipped.**

- **`20261005100000_content_changed_since_review.sql`**:
  - `content_updated_at` on `research_companies`, `treasury_events`,
    `research_company_facts` and `research_findings`. It starts NULL: no edit before
    this migration is known.
  - A `BEFORE UPDATE` trigger per table, `stamp_content_updated_at`. It compares the
    whole row minus an exclusion list, passed as trigger arguments: the review,
    clearance, audit and `ingest_run_id` columns. Anything else is content, including
    columns added later.
  - A client summary written in the same update as a clearance is covered by that
    clearance, so clearing a record with its first summary does not flag it. A summary
    rewritten later does.
  - `changed_since_review`, a stored generated column on each table: `internal`, and
    `content_updated_at` later than `reviewed_at`. Every row the 20261003 backfills made
    `internal` has a NULL `reviewed_at`, so for those any edit after this migration
    counts.
  - `v_research_review_queue` lists changed records and rows, with
    `company_changed_since_review` and `changed_events` / `_findings` / `_facts`. The
    ledger, publishable, facts and absences views carry the column. All five are restated
    `security_invoker`.
  - `v_research_publishable` also gains `ingest_run_id`. The internal app's
    `LEDGER_COLUMNS` has selected it from that view since session 14, and live never had
    it. No production code calls `publishableOnly`, which is why nothing broke.
- **Read model:** `CompanyDossier`, `LedgerEntry`, `CompanyFact` and `StructuralAbsence`
  carry `changedSinceReview`. `ReviewQueueEntry` carries the four counts.
- **Two contract cases**, against a new `changedSlug` slot (Verrall: the record, one
  event and its custody fact):
  - a changed record stays `internal` and on the register, and its rows and queue entry
    are flagged;
  - a draft row is never flagged as changed.
  - An adapter wiring test checks that every read selects the new columns.
- **`@platform/ui`:** ledger, fact and absence panels take `changed`. It is a solid rule
  in `--color-warning`, set against the draft's dashed grey: this row was read, then moved.
- **`/research`:**
  - The review control badges a changed record and offers "Mark reviewed again". That
    calls `setReviewState(…, 'internal')`, which restamps `reviewed_at` and keeps
    clearance.
  - Changed rows form one group with "Mark these reviewed again", via the new
    `reviewChangedRows`.
  - The To review tab says, for example, "Record changed since review · 2 rows changed
    since review".
- **Seed dumper:** ignores both new columns.
- **Generated types:** hand-added to `database.ts` until the migrate workflow
  regenerates them.

**Verified.**

- **Dry run on live**, inside a self-aborting block, with the trigger, columns and views
  applied:
  - Review: not flagged.
  - Clearance with a new summary: not flagged.
  - Withholding: not flagged.
  - A curator-notes edit: flagged, and queued.
  - Re-review: cleared.
  - A summary rewritten without clearing: flagged.
  - Writing an event's headline and quantity back unchanged: not flagged. This is how
    an unchanged ingest re-read writes a row.
  - An edit to an event's headline: flagged in `v_research_ledger`, and counted in
    `changed_events`.
  - Edits to a finding and to a fact: flagged.
  - A fact sent back to draft: not flagged.
  - Publishable rows stayed at 8, and all four views still run as the caller.
- `now()` is fixed inside one transaction, so the dry run set `reviewed_at` an interval
  either side of it to stand in for later wall-clock time.
- **Deliberate breaks:** five, all caught. Supabase adapter: the ledger flag mapped to
  false, the column dropped from the company select, and the queue's record flag dropped.
  Fixture adapter: the changed counts zeroed, and the record flag dropped.
- `pnpm test` passes in every package; typecheck and lint are green.
- The review control, with a changed record and a changed-rows group, renders at 375px
  and 320px with no horizontal scroll and 44px targets.

**Not done.**

- **333D is not caught retroactively.** Its edit predates the trigger, and it is
  already back in draft on live, so it is in the queue anyway.
- **Ingest re-reads move citations.** On an unchanged re-read, `commit_research_ingest`
  rewrites `source_document_id`, `disclosure_venue` and the like. When a later filing
  restates a reviewed event, the row flags as changed, because what it cites has moved.
  That is deliberate, but it may be noisy once the weekly routine runs.
- **The weekly email** (`sendReviewQueueDigest`) counts each run's draft rows, not
  rows changed since review.
- **Pre-existing:** the seed dumper lists no `ingest_run_id` on events or findings, so
  dumping either table from live throws in `assertKnownColumns`.

