# Corporate Holdings — reconciliation and build progress

Reconciliation of the [`corporate-holdings`](./README.md) spec bundle against the live
repository, and a record of what each session shipped. Same purpose as
[`docs/features/demo-app/build-progress.md`](../demo-app/build-progress.md).

**Status:** Session 1 (data layer) complete. Sessions 2 (ingest workflow) and 3 (pages) not
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

### Files the spec references that do not exist

`dossiers/locate-technologies.md`, `dossiers/digitalx.md`, `dossiers/block-inc.md` and
`reference/company-page-sample.html` are all cited by [`README.md`](./README.md) and are not
in the repository. The spec quotes enough of each dossier inline that session 1 did not need
them, but **session 3 will want the page sample** and anyone re-deriving a structural
decision will want the dossiers. Add them or drop the references.

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

**Not done, and deliberately.**

- `packages/db/src/types/database.ts` is not regenerated — it needs the migration applied to
  the live project. The Supabase adapter reaches the new tables through boundary casts
  confined to named constants, the same pattern `research.ts` uses for `reports`. **Run
  `pnpm --filter @platform/db generate-types` once the migration lands on `main` and drop
  the casts.**
- No `apps/web` route, no `packages/ui` component, no page of any kind. That is session 3.

---

## Session 2 — ingest workflow

Not started. Before writing any of it:

- Read `node_modules/@mastra/core/dist/docs/` for current signatures rather than relying on
  training data, per the spec's session opener.
- Register the two agent steps (`extractEvents`/`score` on Rex, `classify` on Lex) in
  `packages/shared/src/modelScopes.ts` with `fallbackAgent` set, and wrap each
  `agent.generate(...)` in `stepRequestContext('researchIngest.<step>')` — otherwise the
  steps do not appear in `/settings/models`. This is a repo convention the spec predates.
- `research_findings.natural_key` is the idempotency key for the `score` step, the same way
  `treasury_events.natural_key` is for `persist`.
- The trace bundle for the demo goes in `packages/agent-traces`, whose schema is BTS-owned
  and must not import from `@mastra/core`.

## Session 3 — pages

Not started. `/research`, `/research/[slug]` and `/research/jurisdictions` in **`apps/web`**
(not `apps/hq`), with the components in `packages/ui` — where every shared presentational
component lives, and where `apps/demo` can reach them. Invoke the `bts-design` skill before
writing any of it.
