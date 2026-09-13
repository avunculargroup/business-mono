# Feature Spec — Minute (Client App MVP)

**Product:** Minute, by Bitcoin Treasury Solutions
**Codebase:** `apps/client` — invite-only paid subscription app for CFOs and SMSF trustees
**Status:** Draft (bundle 0.4.0), reconciled against the live database on 2026-09-11.
Where this document and [`build-progress.md`](./build-progress.md) disagree, that one was
checked and this one was not.
**Last updated:** 2026-09-08

---

## Overview

Minute is a third app in the monorepo, built as `apps/client`, alongside `apps/web` (internal ops) and
`apps/demo` (public, fixture-backed). It is the first surface BTS charges a subscription for
and the first surface a person outside the founding team logs into.

Access is invite-only. There is no sign-up form. A founder provisions an account, the client
receives an invite, and billing is handled outside the app for the MVP.

The product hypothesis follows Carri's thesis directly: the subscriber does not lack
information about bitcoin, they lack a way to explain it to a board, a co-trustee, or an
auditor without sounding like they have joined a cult. So the app is not a data terminal. It
is a monitored, sourced, compliance-classified view of the landscape **plus the artefacts a
finance professional needs to take it into a room with other people.**

### What this is not

- Not a trading, custody, wallet or portfolio-tracking surface
- Not a personal advice surface — see [Compliance architecture](#compliance-architecture)
- Not an agent chat surface — see [Why there is no client-facing agent](#why-there-is-no-client-facing-agent)
- Not a trimmed `apps/web`. Almost nothing in `apps/web` is client-shaped; the twenty-two
  route areas there are operations tooling. This is a new app over shared spines.

---

## The two personas, and why they are not the same product

They read the same data and sit under materially different law.

| | **CFO / corporate treasury** | **SMSF trustee** |
|---|---|---|
| Governing framework | Corporations Act, AASB, board treasury policy | SIS Act, sole purpose test, trust deed, annual audit |
| The room they must convince | Board, audit committee, external auditor | Co-trustee, SMSF auditor, accountant |
| The artefact they need | Board paper | Trustee minute and auditor evidence pack |
| Recurring deadline | Half-year and annual reporting | 30 June market valuation, annual audit |

The asymmetry that matters most: **a CFO's obligations are largely self-imposed through board
policy, while a trustee's are statutory.** A board can decide what its treasury policy says. A
trustee cannot decide what SIS Reg 4.09 requires them to have regard to, and an auditor will
check. That makes the SMSF artefacts more prescriptive and, not coincidentally, more valuable
— there is a right shape for a trustee minute and the trustee is on the hook for producing
it.

### MVP scope decision

One app, one codebase, one auth model. `client_type` shapes the framing layer, the library
sections and the export templates. It does not gate the data spine, because the underlying
series and register are identical and two apps would double the compliance surface for no
product gain.

---

## Product architecture — how the not-advice line is held

BTS does not give financial advice, holds no AFS authorisation, and has never needed one.
Bitcoin is not a financial product. That is the position, and the constraints below are what
make it structurally true rather than merely asserted — enforced in the schema and the
repository layer, not in copy.

Two parts of the product surface do touch financial products, independent of bitcoin's
status: listed securities in `/register`, and digital asset platforms in `/directory` since
the April 2026 amendments. Neither is a problem. Both are why the rules below are worth
having in writing.

### Rule 1 — No personal circumstances. Enforced by absence.

The app never captures a subscriber's personal circumstances. Not fund balance, not age, not
member details, not risk tolerance, not existing holdings, not entity financials.

This is enforced by there being **no columns to put them in**. A scenario tool that accepts
inputs must hold them in component state and never persist them, and the repository
interface must expose no write path that could accept them. `apps/client` gets a boundary
test in the shape of `apps/demo/lib/boundary.test.ts` asserting the write surface is empty.

Personal circumstances are the ingredient that turns information into advice. A service that
cannot receive them cannot give it, and "we have no facility for you to tell us" is a true
statement about the schema rather than a promise about behaviour.

### Rule 2 — Lex classifies at ingest; the client app reads only what cleared

Reuse the existing pattern. Nothing is classified at render time. The client repository
reads only rows already carrying a client-safe classification and a published state. If Lex
has not cleared it, `apps/client` cannot see it, and the reason it cannot see it is a `WHERE`
clause, not a component.

### Rule 3 — The Service Statement is a blocking gate, not a footer

First login presents the **Service Statement** as a blocking acknowledgement: what the service
is, what it is not, that it provides factual information and not financial advice, that BTS
holds no client assets, that BTS has no facility to consider the subscriber's circumstances,
and that BTS is paid by the subscriber and by nobody else.

This is not a regulatory document — no FSG is required, and publishing one would wrongly imply
a licence BTS does not hold and has never held. It is a plain statement of position, and it is
the artefact that evidences that position if anyone ever asks.

The acknowledgement is recorded with a timestamp and the document version. A new version
re-triggers the gate. Every page carries a standing information-only notice in the shell, so
it cannot be removed by forgetting to add it to a new route.

### Rule 4 — The register is precedent research, not securities analysis

`/register` exists for learning and for building your own treasury case. It answers "how did
an Australian entity actually do this" — which accounting standard, which custody model, what
board authority, how it was disclosed and when. It never answers "how did it go for them".

The practical line: **implementation facts, not outcome facts.** Accounting treatment, custody
model, deed or board authority, disclosure wording and timing, auditor questions — all in.
Current holding value, unrealised gain, share price since announcement — all out. The moment
outcome facts appear the page stops being precedent and starts being performance, which is a
different question about a different asset.

> **How it is enforced.** `field_source_minimums.client_fact_class` classifies each field key
> as `implementation` or `outcome`, and the RLS policy on `research_company_facts` admits only
> the first. A key nobody has classified has no row and is therefore invisible — silent
> exclusion is the safe direction, because a missing implementation fact is a gap while a
> leaked outcome fact is the product changing shape. The seven live keys are classified in the
> migration; `operating_metric` — funding runway, operating context — is the one marked
> `outcome`.

No basis, no comparison, no ranking, no implied merit. Every fact carries its provenance rail
and its as-at date. Absences are stated explicitly rather than left blank.

### Rule 5 — Neutral delta colour

Unchanged from the platform rule. No green-up, red-down on any metric. Gold reserved for
freshness. This is not a stylistic preference: colouring a rising indicator as good is an
implied view, and an implied view served to a paying subscriber is exactly the thing the rest
of this document is trying to avoid.

### Rule 6 — Every commercial relationship is recorded, including the ones worth nothing

Any entity appearing on a client surface must have a `commercial_relationships` row or
verifiably none. Reciprocal referral arrangements with no money in them are still conflicts
and still get disclosed. "No fee changed hands" is an explanation, not an exemption.

Disclosure appears in three places, and all three are required: the Service Statement, a
standing line in the directory shell, and a badge on the individual card. A subscriber
should never have to leave the screen they are on to find out whether BTS has an interest in
what they are reading.

---

## Security finding — must be resolved before any client logs in

> **Corrected by the verification pass.** It is not eleven. The live database carries **114
> permissive policies across 107 tables**, and 14 of those are a class this section's audit
> query cannot see (`USING (true)` for `authenticated`, which no grep for `auth.role()` will
> return). Option B was taken and applied to all 114. See
> [`build-progress.md`](./build-progress.md#a2--the-rls-hole-is-roughly-ten-times-the-stated-size).

`schema.sql` carries eleven RLS policies and every one of them is:

```sql
USING (auth.role() = 'authenticated')
```

That was correct for a two-person team where "authenticated" and "founder" were the same
set. **The moment a subscriber authenticates against the same Supabase project, they can
read the CRM, the agent activity log, the compliance documents and the contract library.**

This is a blocker, not a hardening item. Two options:

**Option A — separate Supabase project for the client app.** Cleanest boundary, worst
operational story: the spines would need replication, and the whole value of `@platform/data`
is one interface over one database.

**Option B (recommended) — rewrite the internal policies to check team membership, and add
account-scoped policies for the new client tables.**

```sql
-- Helper: is the current user a member of the founding team?
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Then, for each of the eleven existing policies:
DROP POLICY "contacts_all" ON contacts;
CREATE POLICY "contacts_team" ON contacts
  FOR ALL USING (is_team_member());
```

Option B is correct regardless of whether this app ships, which is a good sign it is the
right option. Do it first, in its own migration, before anything below.

---

## The directory, and why nobody pays to be on it

The `products_services` and `advisors_partners` registers look like a revenue line: list the
vendors, take a referral fee. **Decision: no referral revenue, in either direction, at any
point in this MVP.** The subscription is the business model. This section records why, so the
question does not get reopened every quarter by someone who has not read the reasoning.

### The product reason, which is the main one

A register showing live regulatory status of Australian bitcoin service providers is worth a
subscription *because* the providers being tracked are not paying for the privilege. Taking
their money would make the asset worth less than the money. Independence is not a constraint
being worked around here; it is the inventory.

### The structural reason

The Corporations Amendment (Digital Assets Framework) Act 2026 added digital asset platforms
and tokenised custody platforms to the financial products listed in s764A(1), with Royal
Assent on 8 April 2026. A DAP is a facility whose operator holds digital tokens on behalf of
clients: exchanges, brokers, custodial wallet providers. Bitcoin itself is unaffected and
remains outside the definition.

BTS reports factual changes about these providers — a registration lapsed, an attestation
went stale, a price moved. Reporting a fact about a provider is a long way from recommending
one, and the distance is maintained structurally: no ranking, no score, no call to action on
any card where `is_financial_product` is true.

Taking a fee from a provider would collapse that distance in a single step. ASIC's Info Sheet
269 makes the point directly — a paid service commenting on financial products is more likely
to be giving advice about them. Free listing keeps the directory factual by construction
rather than by restraint.

### What this means for the build

- Listing is free. Inclusion criteria are objective and published. Everyone meeting them is
  listed. Nobody can buy in, buy placement, or buy out.
- No fee flows to or from BTS in connection with any listed entity.
- Non-monetary and reciprocal arrangements may still exist — a firm BTS refers work to
  informally, a partner who speaks at an event. Those are still conflicts and are still
  disclosed. `commercial_relationships` exists to record them, including the zero-fee ones.
- A DB constraint enforces the no-fee rule so it cannot be relaxed by an afternoon's
  enthusiasm. Relaxing it is a reviewable migration, not a config change.

If the position is ever revisited, the first action is not a build. It is legal advice on
whether taking payment from providers you report on changes what the service is.

---

## Data model

Additive. No changes to existing tables beyond the RLS rewrite above.

### `client_accounts`

One row per subscribing organisation or fund.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `display_name` | TEXT | e.g. `Meridian Capital Group`, `The Hale Superannuation Fund` |
| `client_type` | TEXT | `corporate`, `smsf` — shapes framing and exports |
| `subscription_status` | TEXT | `invited`, `active`, `paused`, `lapsed`, `cancelled` |
| `subscription_started_at` | DATE | |
| `subscription_renews_at` | DATE | Watched by Simon, reusing the existing expiry pattern |
| `related_company_id` | UUID | FK → `companies`, nullable — CRM linkage where one exists |
| `notes` | TEXT | Internal only. Never rendered in `apps/client`. |
| `created_by` | UUID | FK → `team_members` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Deliberately absent: anything describing the client's financial position. See Rule 1.

### `client_users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, references `auth.users(id)` |
| `account_id` | UUID | FK → `client_accounts`, NOT NULL |
| `full_name` | TEXT | |
| `email` | TEXT | |
| `role` | TEXT | `primary`, `member` — seat management only, not a permission model |
| `status` | TEXT | `invited`, `active`, `disabled` |
| `last_seen_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

A `client_users` row and a `team_members` row must never share an `id`. Add a check at the
application layer and an assertion in the seed.

### `client_disclosures`

The blocking gate's audit trail.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `client_user_id` | UUID | FK → `client_users` |
| `document_id` | UUID | FK → `compliance_documents` — the Service Statement version served |
| `document_version` | TEXT | Denormalised, because versions get superseded |
| `acknowledged_at` | TIMESTAMPTZ | |
| `ip_address` | TEXT | |

Reuses the existing `compliance_documents` library rather than introducing a second copy of
the Service Statement. This is the point of having built that feature.

> **Corrected.** `compliance_documents` did not exist, in `schema.sql` or in the live
> database, and neither did `contracts`, `company_profile` or `compliance_obligations`. The
> first two have been created minimally so the gate can be built; the `contracts` FK was
> dropped. `doc_type` rejects `fsg` outright. See
> [`build-progress.md`](./build-progress.md#a4--there-is-no-fsg-and-no-library-to-hold-one).

### Additions to existing ecosystem tables

Three columns, all additive.

| Table | Column | Type | Notes |
|---|---|---|---|
| `products_services` | `is_financial_product` | BOOLEAN | DAP or TCP under s764A(1), or not. `NOT NULL`, no default — an unassessed row must not slide in as `false`. Every row is assessed on create. |
| `products_services` | `product_classification_note` | TEXT | Why. DAP, TCP, or neither, and what the assessment relied on. |
| `ecosystem_changes` | `client_note` | TEXT | The client-safe curator note. Separate column, not a filtered view of the internal one — same reasoning as the publish wall. |

The internal `curator_note` is written for a director and is allowed to editorialise, because
directors are allowed to have views. `client_note` is not, and promoting one into the other
through a filter would eventually leak the sentence that should never have left the building.

### `commercial_relationships`

Every commercial or reciprocal arrangement between BTS and a listed entity. Zero-value
arrangements are rows too — see Rule 6.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `entity_type` | TEXT | `product_service`, `advisor_partner` |
| `entity_id` | UUID | FK, resolved by `entity_type` |
| `relationship_type` | TEXT | `inbound_referral`, `reciprocal`, `commercial_agreement`, `none` |
| `direction` | TEXT | `inbound` (they refer to BTS), `outbound` (BTS refers to them), `mutual` |
| `fee_basis` | TEXT | `none` only, in the MVP. Column exists so the constraint has something to constrain. |
| `fee_amount` | NUMERIC(10,2) | Nullable |
| `disclosure_text` | TEXT | Rendered verbatim on the card. Not generated, not templated. |
| `is_active` | BOOLEAN | |
| `started_at` / `ended_at` | DATE | |
| `related_contract_id` | UUID | FK → `contracts`, nullable. The paperwork behind the arrangement. |
| `approved_by` | UUID | FK → `team_members` |
| `notes` | TEXT | Internal only |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

A DB-level constraint enforces the decision:

```sql
ALTER TABLE commercial_relationships ADD CONSTRAINT no_fees_mvp
  CHECK (fee_basis = 'none' AND fee_amount IS NULL);
```

The constraint is the point. It means "no referral revenue" is not a thing anyone has to
remember, and revisiting it is a reviewable migration with legal advice behind it rather than
an afternoon's enthusiasm. Zero-fee relationships still get rows, because a
reciprocal arrangement with no money in it is still a conflict and still gets disclosed.

### RLS for the new tables

```sql
ALTER TABLE client_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_disclosures ENABLE ROW LEVEL SECURITY;

-- Team sees everything
CREATE POLICY "client_accounts_team" ON client_accounts
  FOR ALL USING (is_team_member());

-- A client user sees only their own account
CREATE POLICY "client_accounts_self" ON client_accounts
  FOR SELECT USING (
    id = (SELECT account_id FROM client_users WHERE id = auth.uid())
  );

CREATE POLICY "client_users_self" ON client_users
  FOR SELECT USING (
    account_id = (SELECT account_id FROM client_users WHERE id = auth.uid())
  );

CREATE POLICY "client_disclosures_self" ON client_disclosures
  FOR ALL USING (client_user_id = auth.uid());
```

Note what is missing: there is no client-facing `INSERT` or `UPDATE` policy on any spine
table. Subscribers read. That is the whole permission model, and it is deliberately boring.

---

## Routes

Eight. Anything not on this list is out of MVP scope.

### `/` — The Brief

The habit surface. Today's narrated market report, or the most recent one, with the quiet-day
path honoured exactly as the findings engine specifies: if nothing cleared the materiality
floor, the page says so plainly and does not manufacture a story to fill the space.

- Narrated summary, dated, with the finding rows visible beneath it
- Each finding carries its type, its as-at date and its provenance rail
- Below the fold: the last seven days, collapsed
- Empty state on a quiet day is a first-class design, not a fallback

### `/signals` — what has changed

The ecosystem signal engine's spine, promoted. `ecosystem-signal-feature.md` already put
`client_relevant` and `compliance_class` on `ecosystem_changes` specifically so this
promotion would be a UI change rather than a migration, and described the client-promotion
Lex gate as built and dormant, activating the day the companion app ships. This is that day.

The gate, now live:

| `compliance_class` | Promotion path |
|---|---|
| `neutral` | Director flags `client_relevant`, no further approval |
| `valuation_adjacent` | Director flags, no further approval |
| `advice_adjacent` | Lex suspend/resume approval required |
| `solvency_adjacent` | Lex suspend/resume approval required |

A `regulatory_change` classifies `solvency_adjacent` at minimum, so no AUSTRAC or ASIC
register movement ever reaches a subscriber without a human clearing it. That is correct and
it is also the operational cost of this route: someone approves each one by hand. Size it
before promising a same-day feed.

The feed itself:

- Neutral change type, old state → new state, as-at date, source link
- `client_note` where one exists, never the internal `curator_note`
- Change type is never colour-coded as good or bad. A release is an event, not news.
  Severity bands may use warning and destructive; gold stays on freshness; nothing is green.
- Quiet-day path applies. A week with no material change says so.
- Absence is a fact: "last attested 401 days ago, expected cadence quarterly" is a signal,
  and arguably the most valuable one on the page.

`client_type` weights ordering — registration status and custody surface first for trustees,
treasury and accounting first for corporates — but nothing is hidden from either.

### `/indicators`

The macro and on-chain series, presented as reference data.

- Series rendered with `JetBrains Mono` for values, warm grid lines, neutral deltas
- Freshness indicator in gold — the only gold on the page
- Every series states its source and its update cadence
- No composite score, no signal light, no "current reading: bullish"

### `/register`

The corporate research register, scoped to what Lex cleared for client distribution.

- List by tier, no holdings figure on the list page, consistent with `/research`
- Detail view: position, ledger, qualitative facts, stated absences, withheld list
- **Cite in a pack** action on every fact row: drops the fact plus its provenance into the
  precedent section of a `/prepare` pack the subscriber is drafting. This is what makes the
  register's purpose legible from the interface rather than from a disclaimer — someone using
  it is visibly building a case, not browsing holdings.
- `ProvenanceRail`, `BasisChip` and `ResearchLedger` come from `@platform/ui` unchanged.
  These components already render in both `apps/web` and `apps/demo`, which is precisely
  the reuse case `@platform/ui` was factored for.

### `/directory`

Every listed entity, financial product or not, as neutral factual entries. Not a marketplace,
not a shortlist, and the difference is enforced by structure rather than by wording.

- Grouped by category, sorted neutrally within category. No ranking, no score, no badge that
  reads as endorsement. `australian_owned` is a fact and may be shown; "recommended" is not
  a fact and may not.
- Every card shows current regulatory status from the `regulatory_register` watch, with its
  as-at date. Under the transition arrangements a provider's status can move, and a stale
  status is worse than none.
- Every card carries its `commercial_relationships` disclosure, or states that BTS has no
  relationship with the entity. Both are affirmative statements; neither is a blank space.
- Cards where `is_financial_product = true` carry no outbound link and no contact action.
  They are reference entries, and the absence of a call to action is the structural difference
  between reporting on a provider and distributing one.
- Published inclusion criteria live on the page, not in a help doc.

`/directory/how-we-make-money` is a route, not a footer. It lists every active commercial
relationship, its direction, its fee basis and its disclosure text, generated from
`commercial_relationships` rather than maintained by hand. Provenance-first applied to BTS's
own revenue. If it is ever embarrassing to publish, that is the arrangement telling you
something.

### `/library`

The reference layer, and the first place `client_type` changes what is on screen.

**Shared:** what bitcoin is and is not, custody models, volatility framing, counterparty
risk, common objections and how to answer them.

**Corporate sections:** accounting treatment and the AASB position, board treasury policy
scaffolding, audit committee questions, disclosure considerations.

**SMSF sections:** trust deed and whether it permits, sole purpose test, separation of assets,
in-house asset rules, 30 June market valuation, what an SMSF auditor will ask for and why.

Each entry is dated, sourced and reviewed on a cycle tracked in `compliance_obligations`, so
a stale library entry becomes an obligation rather than a discovery.

### `/prepare` — the differentiator

This is the reason someone renews.

The subscriber selects a purpose and gets a structured pack, generated from cleared facts
and library entries, exported as markdown and PDF:

- **Corporate:** board paper, audit committee briefing note, treasury policy skeleton
- **SMSF:** trustee minute, investment strategy note, auditor evidence checklist

Constraints that keep this on the correct side of the line:

1. Templates state considerations and questions. They never state conclusions.
2. No template output contains a recommendation, an allocation percentage or a target.
3. Every generated pack carries the information-only notice and the as-at date on page one.
4. Nothing the subscriber types is persisted. The pack is generated and downloaded; the
   inputs die with the browser tab.

Mechanically this is the `compliance_documents` template pattern — `{{variable}}` markdown
with a declared variable schema — pointed at a different consumer. Reuse it rather than
inventing a second templating approach.

### `/account`

Seats, subscription status, Service Statement and acknowledgement history, contact route to
BTS. Deliberately
thin. Billing is manual for the MVP: invite-only means every account is onboarded by hand,
so a payments integration would be the most expensive way to save the least work.

---

## Why there is no client-facing agent

Every instinct on this platform points at putting Simon in front of the subscriber. Do not,
in the MVP.

A trustee typing "should my fund hold 5% bitcoin" into a chat box has just asked for personal
advice, and any answer fluent enough to be useful is close enough to advice to be a problem.
The platform's own principle applies with unusual force here: fluent prose about a false
positive is more dangerous than clumsy prose about a real one — and a paying subscriber acting
on it is the worst possible audience for a confident wrong answer.

There is a defensible v2 shape: retrieval-only question answering, scoped strictly to
`/library` and `/register`, that returns *passages with citations* rather than a composed
answer, and refuses anything phrased in the second person. Grounded, extractive, no
synthesis. That is a real feature and it is not the MVP.

Agents remain busy on the other side of the wall. Lex classifies at ingest, the findings
engine narrates the brief, Simon watches `subscription_renews_at` alongside the existing
expiry monitoring. The subscriber simply never talks to any of them.

---

## Architecture

```
apps/client  →  @platform/data           →  @platform/shared
             →  @platform/data-supabase  →  @platform/data, @platform/db, @platform/shared
             →  @platform/ui             →  @platform/shared
```

Not `@platform/signal`. Not `@platform/voice`. Not `@platform/agents`. Enforced by
`package.json` and by a boundary test, following the precedent set by `apps/demo`.

- Next.js 15 App Router on Vercel, matching `apps/web`
- Authenticated shell at `app/(client)/`, public `/login` and `/invite/<token>` outside it
- `middleware.ts` gates everything, plus a second gate for the disclosure acknowledgement
- Server component fetches, client component renders — the existing house pattern
- Design tokens from `@platform/ui`. Invoke the `bts-design` skill before writing UI; the
  archived `DESIGN_BRIEF.md` is backing data, not the source of truth.

### Repository additions

New interfaces in `@platform/data`, read-only by construction:

```ts
interface ClientBriefRepository {
  latest(): Promise<Brief | null>;          // null is the quiet day, not an error
  recent(days: number): Promise<Brief[]>;
}

interface ClientRegisterRepository {
  list(): Promise<RegisterEntry[]>;         // cleared rows only
  bySlug(slug: string): Promise<RegisterEntry | null>;
}

interface ClientLibraryRepository {
  sections(clientType: ClientType): Promise<LibrarySection[]>;
}
```

No method on any client repository returns a write. The interface is the enforcement, and
the conformance suite asserts it — same approach as `ResearchRepository`.

---

## Build sequence

Three sessions, matching the house pattern of data layer → workflow → surface.

**Session 1 — Foundation and the security fix**
1. Migration: `is_team_member()` and the eleven policy rewrites
2. Migration: `client_accounts`, `client_users`, `client_disclosures` and their policies
3. `@platform/data` interfaces and conformance suite
4. `@platform/data-supabase` implementations

**Session 2 — Shell, auth and the compliance gate**
1. `apps/client` scaffold, boundary test, dependency graph assertions
2. Invite flow, login, middleware
3. Blocking disclosure gate and `client_disclosures` recording
4. App shell with the standing information-only notice
5. Activate the dormant Lex client-promotion gate — suspend/resume on `advice_adjacent` and
   `solvency_adjacent`, and the internal approval queue in `apps/web` to work it

**Session 3 — Surfaces**
1. `/` and `/indicators`
2. `/signals` — the promoted feed, quiet-day path, client notes
3. `/register` reusing the `@platform/ui` research components
4. `/directory` and `/directory/how-we-make-money`
5. `/library` with `client_type` sectioning
6. `/prepare` templates and export
7. `/account`

---

## Open questions

- **Library review cadence.** Every entry needs a review interval, but a single annual cycle
  will be wrong in both directions — the SIS content moves rarely, the accounting content
  moves with each AASB update. Suggest per-entry `review_due_date` seeded by section.
- **Billing.** Manual for the MVP. When it stops being manual, `subscription_status` and
  `subscription_renews_at` are the fields a provider webhook would drive.
- **`/prepare` PDF generation.** The contracts spec already flags markdown-to-PDF as an open
  question. Same answer needed here, and solving it once serves both.
- **Seat limits.** `client_users.role` distinguishes `primary` from `member` but nothing
  enforces a seat count. Fine while every account is provisioned by hand.
- **Lex gate throughput.** Every regulatory change needs a human approval before it reaches a
  subscriber. During the DAP transition that could be a steady stream rather than a trickle.
  If it becomes a bottleneck the answer is a batched daily approval queue, not a lower gate.
- **Directory inclusion criteria.** Objective and published is the requirement; what they
  actually say is undecided. Suggest: operating in Australia, AUSTRAC registered where
  applicable, current AFSL or lodged application where applicable, and a verifiable
  Australian support channel.
- **Revisiting referral revenue.** Out of scope and constrained at the DB level. If it is ever
  reopened, the sequence is: legal advice on whether payment changes what the service is, then
  a migration relaxing `no_fees_mvp`. Not the other order.
