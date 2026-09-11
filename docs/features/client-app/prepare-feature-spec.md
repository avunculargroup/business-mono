# Feature Spec — `/prepare`

**Product:** Minute, by Bitcoin Treasury Solutions
**App:** `apps/client`
**Feature:** Document preparation — board papers, trustee minutes, auditor evidence packs
**Status:** Draft (bundle 0.4.0), reconciled against the live database on 2026-09-11.
Where this document and [`build-progress.md`](./build-progress.md) disagree, that one was
checked and this one was not.
**Last updated:** 2026-09-09
**Parent spec:** `client-app-mvp-spec.md`

---

## Overview

`/prepare` is the reason a subscription renews. Everything else in `apps/client` is a
well-made version of something a determined CFO could assemble themselves given a weekend
they do not have. This is the thing they cannot produce at all: the artefact that carries the
decision into a room with a board, a co-trustee, or an auditor in it.

The subscriber works through a structured set of prompts and gets back a document — a board
paper, a trustee minute, an auditor evidence pack — that reads as though a competent person
who understood their obligations wrote it, because one did. The prompts came from BTS. The
answers came from them.

### The non-negotiable rule

**The pack asks questions and states facts. It never states conclusions.**

A board paper that recommends a 2% allocation is advice. A board paper that lays out the
eleven questions a board should be able to answer before deciding, with the current state of
every relevant fact attached and sourced, is not. BTS supplies the scaffolding and the
evidence. The client supplies the judgement.

BTS does not give financial advice and holds no AFS authorisation. This rule is what makes
that structurally true in the one place where the product comes closest to the line.

This is a compliance constraint and it is also just a better product. A board paper visibly
generated from an outside template gets identified in roughly four seconds and carries no
weight. One where the CFO has worked through the reasoning is theirs, survives questioning,
and is worth what they paid for it.

### Scope

**In scope**

- Six core artefacts, three per persona
- A seasonal variant of the SMSF evidence checklist scoped to 30 June valuation
- Deterministic template rendering with fact injection from BTS spines
- Local-only storage of subscriber-authored prose
- Export to print-ready PDF and markdown
- Template versioning and Lex review lifecycle

**Out of scope**

- Any LLM composition at generation time — see [Why no model runs here](#why-no-model-runs-here)
- Any conclusion, recommendation, allocation figure or target, in any template
- Server-side storage of subscriber-authored content
- Collaborative editing between two users on one account
- e-signature on trustee minutes
- Reading the client's trust deed, financial statements or any other client document

---

## The two-layer model

Everything in `/prepare` is either a **fact** or **prose**, and the two are stored,
regenerated and governed differently. Getting this split right is what makes the rest work.

| | **Facts** | **Prose** |
|---|---|---|
| Origin | BTS spines — indicators, register, signals, library | The subscriber typed it |
| Storage | Fetched at generation, snapshotted per pack | IndexedDB on the device, never transmitted |
| Lifespan | Regenerable, staleness-aware | Durable, survives every fact refresh |
| Governed by | Lex classification at ingest | Nothing. It is the client's own writing. |
| Rendered as | Labelled blocks with provenance rails | Body copy under the section heading |

The consequence that matters: **facts refresh, prose persists.** A board paper drafted in
March and tabled in May pulls current evidence without the CFO rewriting a word of their
reasoning. That only works if the layers were separate from the first commit, which is why
this section comes before the data model rather than after it.

The second consequence: BTS's servers never hold the composed document. The not-advice
boundary stops being a policy anyone has to remember and becomes a fact about where bytes
live.

---

## Data model

### `prepare_templates` (server)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `slug` | TEXT | e.g. `board-paper-treasury`. Stable across versions. |
| `title` | TEXT | |
| `artefact_type` | TEXT | `board_paper`, `audit_committee_note`, `treasury_policy`, `trustee_minute`, `investment_strategy_addendum`, `auditor_evidence`, `valuation_pack` |
| `client_type` | TEXT | `corporate`, `smsf`, `both` |
| `version` | TEXT | Semver-style |
| `status` | TEXT | `draft`, `under_review`, `lex_review`, `approved`, `active`, `superseded`, `archived` |
| `body` | TEXT | Template source — see [Template format](#template-format) |
| `facts_required` | TEXT[] | Fact keys the template may bind. Validated on save. |
| `lex_reviewed_at` | TIMESTAMPTZ | |
| `lex_reviewed_by` | UUID | FK → `team_members` |
| `lex_notes` | TEXT | What Lex changed and why. Internal. |
| `regulatory_references` | TEXT[] | e.g. `SIS Reg 4.09`, `AASB 138`. Surfaced in the pack. |
| `review_due_date` | DATE | Feeds `compliance_obligations` |
| `notes` | TEXT | Internal |
| `created_by` | UUID | FK → `team_members` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Only one row per `(slug)` may hold `status = 'active'`. Same constraint pattern as
`contract_templates`, and worth enforcing in the DB rather than the API this time, because
two active board paper templates would silently split the client base.

### `prepare_generations` (server)

The audit row. Records **that** a pack was generated and **what facts BTS served**. It does
not record a single word the subscriber wrote.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `account_id` | UUID | FK → `client_accounts` |
| `template_id` | UUID | FK → `prepare_templates` |
| `template_version` | TEXT | Denormalised — versions get superseded |
| `artefact_type` | TEXT | |
| `fact_snapshot` | JSONB | The `Fact[]` array served, verbatim |
| `generated_at` | TIMESTAMPTZ | |
| `event` | TEXT | `created`, `facts_refreshed`, `exported` |

**Why this row exists:** if a template is later found to be wrong, this answers "who received
the bad version and which facts were current when they did". That is the only reason it
exists, and it is the reason it contains no free text. There is no column a subscriber's
circumstances could land in even by accident, consistent with Rule 1 of the parent spec.

```sql
ALTER TABLE prepare_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prepare_generations_team" ON prepare_generations
  FOR ALL USING (is_team_member());

CREATE POLICY "prepare_generations_own_account" ON prepare_generations
  FOR SELECT USING (
    account_id = (SELECT account_id FROM client_users WHERE id = auth.uid())
  );

CREATE POLICY "prepare_generations_insert_own" ON prepare_generations
  FOR INSERT WITH CHECK (
    account_id = (SELECT account_id FROM client_users WHERE id = auth.uid())
  );
```

This is the single exception to the read-only client permission model in the parent spec, and
it is deliberately the narrowest possible one: insert, own account, no text columns.

### Local store (IndexedDB, `bts-prepare`)

```ts
interface StoredPack {
  id: string;                    // client-generated uuid
  templateSlug: string;
  templateVersion: string;
  artefactType: ArtefactType;
  title: string;                 // subscriber-editable
  status: 'in_progress' | 'complete';
  createdAt: string;
  updatedAt: string;
}

interface StoredResponse {
  packId: string;
  sectionId: string;
  body: string;                  // the subscriber's prose
  skipped: boolean;
  updatedAt: string;
}

interface StoredFactSnapshot {
  packId: string;
  fetchedAt: string;
  facts: Fact[];
}
```

Three object stores, `packId` indexed on all three. No sync, no server mirror, no
best-effort backup. If the browser data is cleared the pack is gone, which is a real cost and
is handled in [Recovery](#recovery-and-the-cost-of-local-only).

---

## The fact injection contract

```ts
type ComplianceClass =
  | 'neutral'
  | 'valuation_adjacent'
  | 'advice_adjacent'
  | 'solvency_adjacent';

interface Fact {
  key: string;                   // stable, matches facts_required
  label: string;                 // human label as rendered
  value: string;                 // PRE-FORMATTED STRING. Never a number.
  unit?: string;
  asAt: string;                  // ISO 8601
  sourceName: string;
  sourceUrl?: string;
  basis: 'reported' | 'observed' | 'derived';
  complianceClass: ComplianceClass;
  note?: string;                 // client-safe note only
}

interface PrepareFactRepository {
  resolve(keys: string[]): Promise<Fact[]>;   // cleared facts only
}
```

Three rules, each of which has a reason that is not obvious.

**`value` is a pre-formatted string, never a number.** A number in the browser invites
arithmetic, and arithmetic on facts is derivation, and derivation is a basis claim. The
platform rule is no basis, no comparison; the type system is a cheap place to enforce it.
Anything genuinely derived arrives with `basis: 'derived'` already computed server-side by a
view, where it can be reviewed.

**A fact renders in its own block, never inside a sentence.** The template cannot interpolate
a fact into prose, because a sentence characterises what it contains. Not "bitcoin has risen
sharply", but a labelled row carrying its value, its as-at date and its source. If the
subscriber wants to characterise it, they can — in their own prose, in their own words, which
is exactly the point of the two-layer split.

**`resolve()` returns only facts Lex has cleared for client distribution,** and a fact whose
key is requested but not cleared comes back absent rather than null. The template renders the
absence as a stated fact: "not available as at this date". Absence-as-fact, same as the
register and the signals feed.

Staleness is surfaced, never hidden. A fact past its expected cadence renders with the
freshness indicator in gold and its age in words. A pack exported with stale facts says so on
the provenance appendix.

---

## Template format

Markdown with YAML front matter and typed section blocks. Human-editable, diffable in git,
reviewable by Lex without running anything.

```markdown
---
slug: board-paper-treasury
version: 1.3
artefact_type: board_paper
client_type: corporate
title: Board paper — bitcoin as a treasury asset
regulatory_references:
  - AASB 138
  - Corporations Amendment (Digital Assets Framework) Act 2026
facts_required:
  - btc_spot_aud
  - btc_realised_vol_90d
  - au_dap_licensing_status
---

::section id=purpose
prompt: What decision, if any, is being sought from the board at this meeting?
why: >
  A paper that does not name the decision invites the board to infer one.
  Naming it — including "no decision is sought at this meeting" — is what
  makes the paper safe to table.
facts: []
::

::section id=market-context
prompt: >
  What context does the board need about current conditions, and what
  period are you asking them to consider?
why: >
  Boards read a single price as a recommendation. Framing the period
  yourself is how you stop them doing that.
facts: [btc_spot_aud, btc_realised_vol_90d]
::
```

**Block grammar**

| Key | Required | Notes |
|---|---|---|
| `id` | yes | Stable across versions. Responses key off it. |
| `prompt` | yes | The question put to the subscriber. Always a question. |
| `why` | yes | Why the board or auditor asks this. This is the teaching layer. |
| `facts` | yes | May be empty. Keys must appear in `facts_required`. |
| `optional` | no | Default `false`. Optional sections skip without a gap notice. |
| `regulatory_reference` | no | Rendered inline as a citation |

**Validation on save** — rejected if: a `facts` key is absent from `facts_required`, a `why`
is missing, a `prompt` does not end in a question mark, or the body contains any string from
the prohibited-conclusion list (`we recommend`, `you should`, `the appropriate allocation`,
and so on). The last check is crude and will produce false positives. That is the correct
direction for it to fail.

**There is no `placeholder` key and there will not be one.** A model answer is advice with
extra steps, and the moment one exists nine subscribers in ten will submit it unchanged.

---

## The six artefacts

Section lists below are the outline, not the copy. Each becomes a template file.

### Corporate

#### 1. Board paper — bitcoin as a treasury asset

1. Purpose of this paper — what decision is sought, or that none is
2. Why this is on the agenda now
3. What the asset is, and what it is not *(facts)*
4. Current market context and the period being considered *(facts)*
5. Precedent — how other Australian entities implemented this *(facts from `/register`;
   implementation only, never outcome; no comparison, no ranking)*
6. Accounting treatment and its effect on reported results *(facts: AASB position)*
7. Custody model under consideration and the operational risk it carries
8. Australian regulatory position and provider licensing status *(facts, as-at critical)*
9. Risks, and how each would be managed
10. Questions the board should be able to answer before deciding
11. What is being asked of the board
12. Provenance appendix *(generated)*

Section 10 is the spine of the whole artefact. It is a list of questions, it is entirely
BTS-authored, and it contains no recommendation — which is precisely why it is the most
useful page in the document.

#### 2. Audit committee briefing note

1. Scope and limitations of this note
2. Classification and measurement basis *(facts)*
3. How the measurement basis moves reported results
4. Valuation methodology and source, and why that source
5. Existence and ownership — how each is evidenced
6. Custody arrangement and the controls around it
7. Segregation of duties over key material and transaction approval
8. Lines of enquiry the auditor is likely to open
9. Open items for management

#### 3. Treasury policy skeleton

1. Purpose and scope
2. Definitions
3. Authorised instruments and prohibited activity
4. Limits framework — *headings only; the board sets every number*
5. Approval authorities and delegation
6. Custody requirements and key management
7. Counterparty selection and periodic review criteria
8. Valuation, accounting and reporting
9. Breach identification and escalation
10. Review cycle and policy owner

Section 4 is the discipline test for the whole feature. BTS provides the structure of a limits
framework — position limit, concentration limit, rebalancing trigger — and not one figure.
A template that suggested a number would be advice, and it would also be worthless, because
the right number depends on a balance sheet BTS has deliberately never seen.

### SMSF

#### 4. Trustee minute

1. Meeting particulars — fund, trustees present, date, location
2. Matter considered
3. Documents tabled
4. Deed authority relied on — *clause reference, entered by the trustee*
5. Consideration against each SIS Reg 4.09 head *(six prompted subsections)*
6. Sole purpose test consideration
7. Custody and title arrangements
8. Valuation approach adopted, and the source
9. Resolution
10. Signatures and date
11. Provenance appendix *(generated)*

#### 5. Investment strategy addendum

Reg 4.09(2) requires the strategy to have regard to risk, likely return, diversification,
liquidity, the fund's ability to discharge its liabilities, and whether to hold insurance for
members. Those are statutory heads. The template reproduces them verbatim as prompts, which
carries no advice risk whatsoever — BTS is quoting the regulation at the trustee, and the
trustee is answering it.

1. Fund identification and strategy version being amended
2. Description of the asset class being added
3. Risk *(prompt)*
4. Likely return *(prompt)*
5. Diversification *(prompt)*
6. Liquidity *(prompt)*
7. Ability to discharge existing and prospective liabilities *(prompt)*
8. Insurance for members *(prompt)*
9. Allocation approach or range — *trustee-set, no suggested figure*
10. Review triggers
11. Date and trustee signatures

#### 6. Auditor evidence checklist

1. Deed permits the investment — clause reference, deed date, any amendment
2. Investment strategy addresses the asset — version and date
3. Trustee minute recording the decision — date
4. Assets held in the fund's name and separated from personal assets — evidence held
5. Source of funds — fund bank account record
6. Existence and ownership evidence at balance date — method
7. Market value at 30 June — source, method, timestamp, and AUD conversion basis *(facts)*
8. Custody arrangement — provider and its regulatory status as at date *(facts)*
9. Related party and in-house asset consideration
10. Contribution or pension implications, if any

Item 8 is where the vertical integration shows: "the provider's AFSL application status as at
14 August" is an audit evidence item, and the ecosystem signals engine is already tracking it
for other reasons.

### Seasonal variant — 30 June valuation pack

Items 6, 7 and 8 of the evidence checklist, run standalone. Surfaced prominently on `/prepare`
from 1 May and retired 31 July.

This is the strongest renewal anchor in the app, and the mechanism is calendar anxiety rather
than insight: every SMSF holding bitcoin faces a valuation obligation at a fixed annual date,
getting it wrong is expensive, and assembling the evidence is tedious. A subscriber who used
this last June will not cancel in May.

---

## Interaction model

Not a form, and not a wall of headings. One prompt at a time.

Each step is a **line of enquiry** and shows four things:

1. The question
2. `why` — the reason a board or auditor asks it
3. The bound facts, as labelled blocks with provenance rails
4. A text field

Facts arrive in a section two ways: bound by the template via `facts`, or pushed in by the
subscriber from `/register` using **Cite in a pack**. Cited facts carry the same `Fact` shape
and the same provenance rail, and land in the precedent section of the open pack. A section
records which of its facts were cited rather than bound, so the provenance appendix can say
so.

It should feel like being interviewed by someone competent, not like being handed a template.
That is Carri's thesis expressed as an interaction pattern rather than a paragraph of copy.

**Skipping.** Any section can be skipped. A skipped section appears in the export as *"Not
addressed"* rather than silently vanishing. A board paper with a visible gap is more useful
than one that conceals it, and a trustee minute with a visible gap tells the auditor exactly
what to ask about — which is, unintuitively, the trustee's interest as well as everyone
else's.

**Progress.** Section count and completion state, not a percentage. A percentage implies the
document is a task to be finished rather than a piece of thinking to be done.

**Autosave** to IndexedDB on blur and on a debounce. No save button, no unsaved-changes
modal.

---

## Refresh semantics

When a pack is reopened, the app re-resolves `facts_required` and compares against the stored
snapshot.

- No movement: no notice at all
- Movement: a neutral banner — *"7 facts have changed since 14 March"* — with a diff view
  showing old and new side by side
- Refresh is explicit. Facts never update under the subscriber without a click.
- Prose is untouched by refresh under every circumstance
- Refresh writes a `facts_refreshed` row to `prepare_generations`

The diff renders old and new with no colour signalling direction. Neutral delta rule applies
here as everywhere, and it applies with unusual force: a green arrow next to a price in a
board paper is an editorial position appearing in a document with the client's name on it.

---

## Export

Markdown and PDF. PDF via a print stylesheet and the browser's own print pipeline, not a
server-side generator — unglamorous, keeps every byte local, and with the design tokens it
produces better typography than most PDF libraries manage.

**Front matter, on every export, generated not authored:**

- Document title, artefact type, and the date prepared
- Template slug and version
- Information-only notice, verbatim from `compliance_documents`
- BTS identity block from `company_profile` — legal name, ABN, ACN
- A line stating that the facts are as at their individual dates, listed in the appendix

**Provenance appendix, on every export:**

Every fact used, with label, value, as-at date, source name, source URL and basis. Stale
facts flagged with their age. Requested-but-unavailable facts listed as unavailable rather
than omitted.

**Print stylesheet:** Playfair Display headings, DM Sans body, JetBrains Mono for every fact
value, page numbers, running footer with template version and export date. A4 default.

---

## Why no model runs here

Every instinct on this platform points at having Charlie draft the board paper. Do not.

The argument is arithmetic rather than caution. If an agent composes at generation time,
every generated pack is a novel artefact requiring compliance review, and review cost scales
with the number of documents produced. If templates are deterministic and Lex reviews the
template, review cost scales with the number of templates. Five templates reviewed once
beats five hundred documents reviewed never.

**Template review is O(templates). Agent generation is O(documents).** At the point the
product succeeds, those two numbers are very far apart.

The second argument is the product one. An LLM-drafted board paper is a competent, fluent,
anonymous document, and a board can smell it. The value is not in the prose being good — it
is in the CFO having been walked through the reasoning by someone who knew which questions
mattered. A model that writes the answer removes the only part that was worth paying for.

Agents remain central to this feature. They are simply all upstream: Lex classified the facts
at ingest and reviewed each template, the findings engine produced the narration the facts
came from, Rex scored the register entries feeding the precedent section. By the time the
subscriber opens `/prepare`, the agent work is done and committed. Deterministic before LLM,
applied one layer further out than usual.

---

## Recovery and the cost of local-only

Local-only storage has a real cost: cleared browser data destroys a pack, and there is no
server copy to restore from. This is a deliberate trade and it needs handling honestly rather
than quietly.

- A **Download working copy** action exports the pack as a JSON file at any point, including
  mid-draft, and a matching import restores it. That is the backup mechanism, and it is the
  subscriber's to operate.
- The export action prompts for a working copy the first time a pack is exported.
- The empty state and the first-run screen say plainly that packs live on this device.
- No dark pattern, no "are you sure", no nagging. Say it once, clearly, and let adults be
  adults.

---

## Open questions

- **Cited-fact staleness.** A fact cited from `/register` in March and refreshed in May may
  have a newer as-at date but also a changed value, and the subscriber's prose was written
  against the old one. Refresh surfaces the diff, but nothing detects that the surrounding
  sentence no longer follows. Probably unsolvable; worth stating so nobody assumes it is
  handled.
- **Two trustees, one pack.** An SMSF commonly has two individual trustees who both need to
  contribute to a minute. Local-only makes co-editing impossible. The working-copy JSON is a
  usable hand-off for the MVP, but it is a workaround and it will be the first thing anyone
  complains about. Worth deciding whether a shared pack is a v1.1 feature or a reason to
  revisit local-only.
- **Print fidelity.** Browser print pipelines differ, and Safari in particular handles page
  breaks inside tables badly. Needs testing across Chrome, Safari and Firefox before it can be
  called an export feature rather than a print button.
- **`prepare_generations` privacy surface.** The row records that an account generated a
  trustee minute on a date. That is usage metadata, not financial circumstances, so Rule 1 is
  intact — but it is still a record of what a client was contemplating and when. Confirm the
  audit value justifies it before shipping, and consider whether `artefact_type` alone
  suffices without `template_id`.
- **Template review cadence.** `review_due_date` feeds `compliance_obligations`, but the right
  interval differs by artefact. The SIS-derived templates move rarely; anything referencing
  the DAP transition arrangements will move repeatedly over the next eighteen months. Set per
  template, not globally.
- **Prohibited-conclusion validation.** A string blocklist will generate false positives and
  miss creative phrasings. It is a backstop for Lex review, not a substitute for it, and the
  spec should say so wherever the list is maintained.
