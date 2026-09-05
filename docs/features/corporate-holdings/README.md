# Corporate Research

Feature documentation for the Corporate Research section of the BTS internal platform: a register of companies holding bitcoin on their balance sheet, written for Australian CFOs evaluating whether and how to do the same.

**Status:** session 1 (data layer) shipped — see `build-progress.md`
**Owner:** Chris
**Last updated:** 2026-09-04

---

## Read these first, in this order

| # | File | What it is | Read when |
|---|---|---|---|
| 1 | `corporate-research-spec.md` | Product decisions, hard rules, agent pipeline contract, adapter contract, acceptance criteria | Before anything else. Read in full. |
| 2 | `corporate-research-schema.sql` | DDL, enforcement triggers, views, RLS, lookup seeds | Before writing the migration |
| 3 | `demo-app-requirements.md` | `apps/demo` requirements and the fixture roster | Before defining fixture types |
| 4 | `research-fixtures.ts` | Typed fixture starter — fictional entities, real pathologies | Alongside 3 |
| 5 | `build-progress.md` | Reconciliation against the live repo, and what each session shipped | **Before session 2 or 3.** Several names and two pieces of DDL in the files above are wrong against the real repository; this one records what moved and why. |

Reference material, read on demand rather than up front:

| File | What it is |
|---|---|
| `dossiers/locate-technologies.md` | Discovery record 1 — an operating business that left the ASX over its bitcoin holding |
| `dossiers/digitalx.md` | Discovery record 2 — a funds manager, and the look-through problem |
| `dossiers/block-inc.md` | Discovery record 3 — foreign exempt listing, customer assets, US GAAP |
| `company-page-sample.html` | Visual reference for the company page. Not production code. |

The dossiers are the evidence trail. Every structural decision in the spec traces to something that broke in one of them, and the spec cites which. If a decision looks arbitrary, the dossier explains it.

---

## Claude Code session opener

Paste this at the start of each session:

> Read `README.md`, `corporate-research-spec.md` and `corporate-research-schema.sql` in full before writing anything. Then check `node_modules/@mastra/core/dist/docs/` for current API signatures rather than relying on training data. Do not infer Mastra APIs — verify them.

---

## Build sequence

Three sessions. Each has a stopping point that can be verified before the next begins.

### Session 1 — data layer

1. Create a numbered migration in the monorepo from `corporate-research-schema.sql`. Do not apply DDL ad hoc — it must land in `supabase_migrations.schema_migrations` and be reviewable as a diff.
2. Confirm prerequisites exist before applying: `update_updated_at()`, `team_members`, and the pgvector extension for `document_chunks.embedding`.
3. Seed `holding_bases`, `source_classes` and `field_source_minimums` (inline in the SQL).
4. Seed three `jurisdiction_notes`: `aasb_138_revaluation`, `us_gaap_asc_350_60`, `asx_lr_12_3`. Note text for the third is in the spec.
5. Define the `ResearchRepository` interface and the shared conformance suite in `packages/data` — **before** either implementation exists.
6. Define fixture types alongside the schema, from `research-fixtures.ts`.
7. Hand-enter the Meridian Freight fixture end to end.

**Done when:**
- Inserting a `treasury_event` sourced from a `company_web` document raises.
- `v_research_ledger` returns Meridian's first acquisition with `consideration_aud = 1000000` and a non-null `source_url`.
- A holdings row with a non-comparable basis is absent from every aggregate.

### Session 2 — ingest workflow

Build the document resolver and fetcher first. Document acquisition is the binding constraint, not discovery — every company IR page encountered during research was a client-rendered widget that returned nothing.

Then: extract → validate → reconcile → score → classify → persist, per the step contract in the spec. Steps are deterministic unless the spec marks them as an agent step.

Record a `TraceBundle` from a real run for the demo. It must include the `validateNumerics` rejection and must end suspended at the approval gate.

**Done when:**
- Re-running the workflow over the same documents commits zero new rows.
- The extracted ledger matches the hand-entered ledger from session 1 on every field except `detail`.
- A document that 404s produces a row with `retrieval_error` set, not a silent skip.

### Session 3 — pages

`/research`, `/research/[slug]`, `/research/jurisdictions` in `apps/hq`. Components in `packages/ui`, shared with `apps/demo`. Then the demo pages and the annotation layer.

**Done when:**
- The company page renders at 360px with no horizontal scroll.
- The provenance rail reveals a source on every numeric fact.
- A cross-archetype comparison renders the explanatory panel rather than a table.

---

## The three hard rules

Everything else in the spec is negotiable. These are not, and each was learned the expensive way.

**1. No basis, no comparison.** Three research records produced three unrelated mechanisms by which a stated bitcoin figure overstates the corporate position — wrong secondary sources, look-through into a related fund, and customer assets custodied alongside treasury. `holding_bases.comparable` decides what may enter an aggregate.

**2. Source class is an ingest-time gate, enforced by trigger.** Custody, accounting treatment, mandate, covenants and ledger events require `exchange_announcement` or better. One company's About page claimed self-custody with no counterparty risk; its offer document named a third-party custodian and listed custodian insolvency as a key risk. The first version of that dossier recorded the wrong answer by trusting the website.

**3. Ticker is never a key.** Three records, six identifier changes. Resolution runs on legal entity plus registration number, with former names and listing history as lookup paths.

---

## Compliance

The page states what was done and disclosed, with a citation on every claim. It never states what it means for the security.

Lex classifies per field. Restricted in all cases: unrealised position, mNAV or premium to NAV, bitcoin per share, share price movement attributed to any announcement, dilution or accretion narration, and any comparison of shareholder outcome against holding bitcoin directly. The full list is in the spec.

v1 is internal only. Nothing reaches a client-facing surface until the Lex gate is hardened and a director approves through the suspend/resume workflow.

---

## Suggested repository layout

```
docs/features/corporate-research/
  README.md                       ← this file
  corporate-research-spec.md
  corporate-research-schema.sql
  demo-app-requirements.md
  dossiers/
    locate-technologies.md
    digitalx.md
    block-inc.md
  reference/
    company-page-sample.html

packages/data/src/research/       ← interface + conformance suite
packages/data-fixtures/src/research/
supabase/migrations/              ← the migration from the SQL above
```

---

## Known open items

- ~~**Findings Engine integration.**~~ **Resolved in session 1, and the assumption was wrong.** The existing engine is keyed on metric series for the daily market report and has no subject columns to hang a company finding from, so `research_findings` is its own table. See `build-progress.md`.
- **Peer-shaped matching criteria.** `market_cap_band` + `funding_source` + `primary_archetype` is a first guess. Test against a fourth and fifth record before fixing it in the schema.
- **Scale control.** The register spans five orders of magnitude. Any element that ranks or charts across records without a scale control renders the small Australian companies — the ones the audience cares about — as rounding errors.
- **One ledger event to verify.** A capital raise by the record-2 company, with a large portion earmarked for treasury expansion, was found in secondary coverage only. Do not enter it until the announcement is sighted.
