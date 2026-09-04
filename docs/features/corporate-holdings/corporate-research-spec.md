# Feature Spec — Corporate Research

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Company research pages, treasury ledgers, jurisdiction notes
**Status:** Ready for implementation
**Version:** 2 — tightened for build
**Last updated:** 2026-09-03

**Document map**

| File | Purpose |
|---|---|
| `corporate-research-spec.md` | This file. Product decisions, contracts, build sequence. |
| `corporate-research-schema.sql` | DDL, triggers, views, RLS. Run first. |
| `company-page-sample.html` | Visual reference for the company page. Not production code. |
| Dossiers — Locate, DigitalX, Block | Evidence. Every structural decision traces to one. |

---

## What changed in version 2

Version 1 was a design document. It described the model in prose tables, named the constraints, and stopped. Six things were missing for a build, and all six are now closed:

1. **No DDL.** Now in `corporate-research-schema.sql`, including the trigger that actually enforces the source-class gate rather than describing it.
2. **No FX table.** Version 1 said AUD is "computed in a view off an FX series" and never defined the series. `fx_rates` now exists and `v_research_ledger` uses it.
3. **No idempotency contract.** Re-ingesting an announcement would have duplicated events. `natural_key` with a unique constraint per company now handles it.
4. **`basis` described as an open vocabulary but modelled as an enum.** Now a lookup table with a `comparable` flag, so adding a fifth value is an INSERT and the aggregate rule is enforced in data rather than in code comments.
5. **Lex classification had no home.** `research_classifications` classifies per field, and `v_research_publishable` is the only view a client-facing surface may read.
6. **No build sequence, no acceptance criteria, no adapter contract.** All below.

Two things were also *wrong* and are corrected: `company_documents` was specified without the `is_audited` column the prose required, and `treasury_holdings_snapshots` had no `source_document_id` while `treasury_events` did.

---

## Overview

Corporate Research is a register of companies holding bitcoin on their balance sheet, written for Australian CFOs evaluating whether and how to do the same.

It is not a leaderboard. The genre default — ranked holdings, unrealised gain, a large orange number — is a crypto-Twitter artefact that, for an Authorised Representative under an AFSL, is also the fastest route to publishing something that reads as a view on a listed security. This feature states **what was disclosed and where it came from**. It does not state what it was worth.

An Australian CFO is not asking who holds the most bitcoin. They are asking: *has anyone shaped like me done this, what did their board see, and what broke?*

---

## Scope

**In scope:** company pages, treasury ledger with mandatory provenance and basis, jurisdiction notes, document registry with source-class gating, per-field Lex classification, ingest workflow.

**Out of scope for v1:** any valuation output; share price data; client-facing publication (internal only until the Lex gate is hardened and the demo fixtures pass); automated discovery of the regional universe.

---

## Tiering

Three tiers, unequal in depth and non-comparable in the UI.

1. **Regional register** — every AU/NZ/SG entity with disclosed holdings. Hand-curated, exhaustive, high detail. N is under twenty. The credibility anchor.
2. **Peer-shaped** — global companies matched on shape: operating business, market cap band, treasury-allocation archetype, funded from operating cash. Matching inputs are columns (`market_cap_band`, `funding_source`, `primary_archetype`) so criteria are adjustable and visible rather than editorial.
3. **Bellwethers** — Strategy, Metaplanet, Block. Read for mechanism and disclosure language only.

**Seed the regional register by hand.** Discovery automation costs more than the manual pass, and the manual pass produces the ground truth the watcher is tested against. Automation earns its keep on *changes*.

---

## Archetypes

Four categories, all four observed across three dossiers.

| Archetype | Definition | Observed |
|---|---|---|
| `treasury_allocation` | Operating business allocates surplus capital | Locate (initially) |
| `treasury_company` | The balance sheet is the thesis; funded from capital markets | Locate (self-described) |
| `native_exposure` | Fund manager or exchange; asset adjacent to the product line | DigitalX |
| `operational_integration` | Position accrues from a bitcoin business line's gross profit | Block |

`primary_archetype` and `self_described_archetype` are separate columns. Locate presents as a bitcoin treasury company while operating a growing SaaS business; the divergence *is* the case study.

**Archetype gates the comparison UI, not just the label.** A funds manager has no treasury policy to lift, no board approval path worth studying and no covenant story. `packages/ui` must refuse to render a comparison across archetypes — throw in development, render an explanatory panel in production.

---

## The three hard rules

Everything else is negotiable. These are not.

### 1. No basis, no comparison

Three records produced three unrelated ways a stated bitcoin number overstates the corporate position:

| Record | Failure mode | Ratio |
|---|---|---|
| Locate | Secondary sources wrong on consideration | A$1.0m actual vs A$647.5k reported |
| DigitalX | Look-through via units in its own ETF | 308.8 direct vs 503.7 exposure |
| Block | Customer assets custodied alongside treasury | 8,998 corporate vs 28,355 total |

`holding_bases.comparable` decides what may enter an aggregate. `stated_unreconciled` rows render as stated, flagged, and are excluded from every roll-up. Assume a fifth basis exists.

### 2. Source class is an ingest-time gate

Enforced by `enforce_source_minimum()`, not by convention. Custody, accounting treatment, mandate, covenants and ledger events all require `exchange_announcement` or better.

Locate's About page states self-custody with no counterparty risk and no reliance on intermediaries. Its PDS names Zodia as third-party custodian and lists custodian insolvency as a key risk. Dossier revision 2 recorded the wrong answer by trusting the website, and it was wrong in the direction that flatters.

Presentation conventions are not measurement bases: Locate's quarterly deck marks bitcoin at spot, explicitly unaudited. Treatment fields refuse sources where `is_audited = false`.

### 3. Ticker is never a key

Three records, six identifier changes. Resolution runs on legal entity plus registration number, with `company_former_names` and `company_listings` as lookup paths.

- Zoom2u Technologies → Locate Technologies; `ASX:Z2U` → `ASX:LOC` → `NZX:LOC`
- Square, Inc. → Block, Inc.; `NYSE:SQ` → `NYSE:XYZ`; `ASX:SQ2` → `ASX:XYZ`, plus `XYZAA`
- Block's own Appendix 4A gives its OTC ticker as both DGGFX and DGGXF
- "Locate Technologies Inc.", an unrelated Canadian entity, outranks the real company in full-text search

A name-keyed ingest loses Locate's Treasury Management Policy — the most valuable document on that page — because it was filed under the old name.

---

## Register membership

`listing_type` gates membership, it does not annotate it.

Regional register inclusion requires `listing_type = 'primary'` **or** domestic incorporation. Block is ASX-quoted via a 1:1 CDI foreign exempt listing and is ASX 200 included — and is exempt from most ASX Listing Rules, including the 12.3 cash-box test that pushed Locate off the exchange. It belongs in the bellwether tier with a visible foreign-exempt flag. Including it in a regional register would be technically defensible and analytically worthless.

---

## Ingest

**Document acquisition is the binding constraint, not discovery.** Every IR page encountered across three dossiers — Locate's treasury dashboard, purchases page and announcements page, Market Index's announcement list, Listcorp's company page — is a client-rendered widget returning navigation chrome and empty carousels. The two documents that yielded everything were direct PDF links: a marketindex data-API path and a static file on the company's own document directory.

The layer resolves announcement ID → PDF URL and fetches the file whole, independent of whatever renders the index page.

**Priority order:**

1. **Offer documents.** A single PDS resolved custody, mandate, the ASX determination, covenant structure and acquisition history after four rounds of searching produced none of it. Any company that has done an IPO, scheme or migration has one.
2. **Appendix 4C.** Free, standardised, quarterly, machine-friendly. Carries the financing facilities table at item 7.4, related-party payments and quarters-of-funding.
3. **Appendix 4E / annual report.** Accounting notes.
4. **Playbooks.** Block's Bitcoin Blueprint, Locate's Treasury Management Policy. Highest transferability of any artefact and neither is an exchange filing — separate acquisition path via company document directories.
5. Announcements.

**Extraction never keys on document sections.** Locate disclosed its AASB 138 revaluation election under "Accounting Treatment of Bitcoin" in the *risk factors*. Four rounds of searching the financial statements missed it. Chunk and embed whole documents; retrieve by field semantics.

**Operational hygiene:** identifying user agent, one request per host per two seconds, `content_sha256` dedupe, failed fetches recorded with `retrieval_error` rather than discarded — a document that 404s repeatedly is a signal.

---

## Agent pipeline

Verify all Mastra signatures against `node_modules/@mastra/core/dist/docs/` before writing code. What follows is the step contract, not the API.

**`researchIngestWorkflow` — a Workflow, not an Agent.** The pipeline is a defined process with a fixed shape. Agents appear only inside steps where the task is genuinely open-ended.

| Step | Kind | Input → Output | Notes |
|---|---|---|---|
| `resolveDocuments` | deterministic | `{companyId}` → `{documentRefs[]}` | Announcement ID → PDF URL. No LLM. |
| `fetchDocument` | deterministic | `{documentRef}` → `{documentId, sha256}` | Skip on sha match. |
| `chunkAndEmbed` | deterministic | `{documentId}` → `{chunkCount}` | |
| `extractEvents` | **agent (Rex)** | `{documentId}` → `{candidateEvents[]}` | Zod-constrained structured output. |
| `validateNumerics` | deterministic | `{candidateEvents[]}` → `{validated[], rejected[]}` | Every figure re-located in source text. Rejects do not commit. |
| `reconcile` | deterministic | `{validated[]}` → `{events[], deltas[]}` | Events vs snapshots. Materiality floor applied here. |
| `score` | **agent (Rex)** | `{events[], deltas[]}` → `{findings[]}` | Novelty scoring. |
| `classify` | **agent (Lex)** | `{events[], findings[]}` → `{classifications[]}` | Per field. |
| `persist` | deterministic | → `{committed}` | Single transaction. |
| `approvalGate` | **suspend/resume** | → `{approved}` | Only on promotion to `is_published`. Never on ingest. |

**Deterministic before LLM.** Facts and structured data commit before any narration runs. Bruno narrates only pre-computed rows.

**The suspend gate sits at publication, not ingest.** Ingest runs unattended. Nothing reaches a client-facing surface without a director approving in Signal.

**Quiet-day path is mandatory.** Most weeks nothing meaningful happens. `v_research_freshness` measures staleness against the issuer's own `expected_disclosure_cadence` — monthly for DigitalX, episodic for Locate — so silence is not reported where silence is normal.

### Finding types

`covenant_change` and `capital_posture_change` are both new, both discovered in dossiers, and both invisible to every existing tracker.

- **Covenant change.** On 14 August 2025 Locate's lender amended a cash covenant to require a minimum bitcoin balance of A$500,000, with aggregate cash and bitcoin of at least A$1.35m, in recognition of the bitcoin adoption. A secured Australian lender rewrote a liquidity covenant to admit and require bitcoin.
- **Capital posture change.** Locate's ATM sat undrawn for a quarter while an on-market buyback ran. Visible only by joining a quarterly update to a capital change notice. A holdings-only watcher reports "no change" on the quarter the strategy visibly shifted.

**Finding types must tolerate structural absence.** DigitalX has no debt at all. Absence renders as a stated fact — "no financing facilities at quarter end, per Appendix 4C item 7.4" — not an empty panel.

**Materiality floor, calibrated.** Locate's amended notice restated shares on issue by 90,539 — 0.03% — because buyback shares were not yet cancelled. Administrative, not signal. Floor: reconciliation deltas below 0.5% of the reference quantity are logged and suppressed.

---

## Compliance

Lex classifies every field into `publishable`, `internal` or `restricted`. Restricted, in all cases:

- Unrealised position against cost basis
- mNAV, premium or discount to bitcoin NAV, bitcoin per share
- Share price movement attributed to any treasury announcement
- Dilution narration from issuance; accretion narration from buybacks
- Inference about management's view of price from a buyback
- Comparison of shareholder outcome versus holding bitcoin directly
- Characterisation of covenant waivers as a credit-quality signal
- Fund performance figures for registered schemes — off-limits rather than gated
- Third-party analyst characterisations, in any form including attributed quotation

Company-disclosed statistics are citable **with their date**. Locate disclosed bitcoin at approximately 13% of market capitalisation as at 23 September 2025. Recomputing that at today's price is a valuation exercise and is not.

**The line:** the page states what was done and disclosed, with a citation on every claim. It never states what it means for the security.

---

## Adapter contract

Per the `apps/demo` architecture. Interfaces in `packages/data`, two implementations.

```ts
export interface ResearchRepository {
  listCompanies(filter: {
    tier?: Tier;
    archetype?: Archetype;
    jurisdiction?: string;
  }): Promise<CompanySummary[]>;

  getCompany(slug: string): Promise<CompanyDetail | null>;

  getLedger(companyId: string, opts?: {
    publishableOnly?: boolean;   // reads v_research_publishable
  }): Promise<LedgerEntry[]>;

  getPosition(companyId: string): Promise<PositionRow[]>;

  getJurisdictionNotes(keys: {
    standard?: ReportingStandard;
    venue?: string;
    listingType?: ListingType;
  }): Promise<JurisdictionNote[]>;

  getFreshness(companyId: string): Promise<FreshnessRow>;
}
```

Every `LedgerEntry` carries `sourceTitle`, `sourceUrl`, `sourceClass` and `basis` as required fields. A type that permits an entry without provenance permits the bug the feature exists to prevent.

`@bts/data-fixtures` needs two records minimum, and they should be the two that break things: a look-through record (DigitalX) and a source-conflict record (Locate custody). A fixture set of clean records tests nothing.

---

## Build sequence

Three sessions, per the usual pattern.

**Session 1 — data layer.** Run the SQL. Seed `holding_bases`, `source_classes`, `field_source_minimums`, and the three `jurisdiction_notes` records for AASB 138 revaluation, US GAAP ASC 350-60, and ASX Listing Rule 12.3. Hand-enter the Locate record end to end from the dossier. Verify the source-class trigger rejects a `company_web` document on a ledger event.

**Session 2 — ingest workflow.** Document resolver and fetcher first, since it is the binding constraint. Then extract, validate, reconcile, persist. Run it against Locate's known documents and diff the output against the hand-entered record from session 1. That diff is the test.

**Session 3 — pages.** Register, company page, jurisdiction panel. `packages/ui` components shared with `apps/demo`.

**Claude Code session opener:** read this spec and `corporate-research-schema.sql` first, then check `node_modules/@mastra/core/dist/docs/` for current API signatures rather than relying on training data.

---

## Acceptance criteria

Session 1 is done when:
- Inserting a `treasury_event` sourced from a `company_web` document raises.
- `v_research_ledger` returns Locate's first acquisition with `consideration_aud = 1000000` and a non-null `source_url`.
- A holdings row with `basis = 'stated_unreconciled'` is absent from any aggregate.

Session 2 is done when:
- Re-running the workflow over the same documents commits zero new rows.
- The extracted Locate ledger matches the hand-entered ledger on every field except `detail`.
- A document that 404s produces a row with `retrieval_error` set, not a silent skip.

Session 3 is done when:
- The company page renders at 360px with no horizontal scroll.
- The provenance rail reveals a source on every numeric fact.
- Requesting a comparison across archetypes renders the explanatory panel rather than a table.

---

## Jurisdiction note — the two limbs of Listing Rule 12.3

Seed this as `jurisdiction_notes.note_key = 'asx_lr_12_3'`. It resolves the question that blocked session 1 and it is the single most useful thing the section can tell an Australian CFO about listed-entity constraints.

**Rule text.** If half or more of an entity's total assets is cash or in a form readily convertible to cash, ASX may suspend quotation of the entity's securities **until it invests those assets or uses them for the entity's business**. The entity must give holders of ordinary securities written details of the investment or use. Stated exceptions are certain financial institutions, mining exploration entities and oil and gas exploration entities.

**The second limb is the answer.** The rule is not a prohibition on holding liquid assets. It is a prohibition on holding them *uncommitted*. The test turns on whether the assets are being used for the entity's business.

- **Locate** is a logistics SaaS and courier marketplace. Bitcoin on its balance sheet was not being used for that business — it was uncommitted liquid assets. ASX advised the company it considered bitcoin an asset in a form readily convertible to cash and that it risked suspension if it continued. It left for the NZX, which has no equivalent rule.
- **DigitalX** is a digital asset funds manager. Digital assets held in treasury under a stated investment framework are arguably assets used for its business. Holding investments *is* the business.

**Corroborating structure at admission.** The parallel commitments test in Listing Rule 1.3.2(b) applies to an entity that is **not an investment entity** — investment entities are carved out of the admission-stage test entirely. The ongoing rule has no equivalent express carve-out, which is why the analysis has to run through the "uses them for the entity's business" limb rather than an exemption.

**This also explains why the two companies received different questions.** ASX did not raise 12.3 with DigitalX. It came from the opposite direction: in October 2025 DigitalX responded to a query from ASX Enforcement about its treasury asset management operations and strategy, clarifying that its treasury strategy does not classify it as an issuer of investment products or a managed investment scheme. Two companies, one asset, opposite sides of the same test — one asked to prove the holding is part of its business, the other asked to prove its business is not a scheme.

**What transfers to an unlisted Australian company:** nothing directly. The Listing Rules bind listed entities. But the shape of the test does transfer, because financiers, auditors and insurers apply their own versions of it: a holding is assessed relative to the business it sits inside, and the question is always whether the asset is committed to something or merely parked.

**Caution for the record.** This is an analysis of the rule as written and of the two companies' disclosed positions. It is not a statement that ASX has formed any view about DigitalX under 12.3. Nothing reviewed says it has. Classify as `internal` until a director signs off.

---

## Open questions

- **~~Why DigitalX's asset proportion does not trigger the ASX cash-box concern~~ — RESOLVED, see Jurisdiction notes below.**

- **Findings Engine integration.** The spec assumes findings write to the existing engine via subject polymorphism. The existing DDL was not to hand when this was written; confirm the subject columns before session 2 rather than creating a parallel table.
- **Peer-shaped matching criteria.** `market_cap_band` + `funding_source` + `primary_archetype` is a first guess. Test against a fourth and fifth record before fixing it.
- **Scale control.** US$696m of corporate bitcoin against A$1.0m in the same section. Any element that ranks or charts across records without a scale control renders the small Australian companies — the ones the audience cares about — as rounding errors.
