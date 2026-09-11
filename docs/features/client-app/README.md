# Minute — Spec Bundle

**Product:** Minute, by Bitcoin Treasury Solutions
**Codebase:** `apps/client` in `business-mono`
**Feature:** Invite-only paid subscription app for CFOs and SMSF trustees
**Status:** Bundle 0.4.0, reconciled against the live repository and database. The spec
documents below are what the app is built *against*; where the build diverged,
[`build-progress.md`](./build-progress.md) records the divergence and why, and is the
document to trust.
**Bundle version:** 0.4.0
**Last updated:** 2026-09-09

---

## Naming

The product is **Minute**. It sits under BTS as a product, not as a replacement brand — the
company keeps the relationships and the reputation, and the product gets to be named plainly.
Written out: *Minute, by Bitcoin Treasury Solutions*.

Both personas already say the verb. A board minutes a decision; a trustee minutes a
resolution. It is governance-native, has no hype available to it, and passes the test that
matters most for this audience: a colleague glancing at that browser tab in a board meeting
sees a governance tool, not a crypto product.

**In the code, the app stays `apps/client`.** The monorepo names apps by role — `web`,
`demo`, `client` — and a product name in the directory tree would break that and age badly if
the product is ever renamed. Same for the `client_*` tables. Minute is what subscribers see;
`client` is what the repository calls it.

**Domain:** `minute.btreasury.com.au`, alongside `hq.btreasury.com.au`. The symmetry is
useful — hq is where the team works, minute is where the client does.

**Lockup:** *Minute* in Playfair Display 600, *by Bitcoin Treasury Solutions* beneath in DM
Sans at caption spec — 12px, weight 500, 0.04em, uppercase.

Full rules — the three registers of the company name, lockup specs, vernacular and the
prohibited word list — are in `naming.md`, which belongs in the design skill rather than here.

**Vernacular:** each `::section` block in `/prepare` is a **line of enquiry** — a question and
the reason a board or auditor asks it. Audit vocabulary, structurally incapable of implying a
recommendation, and it teaches the subscriber what kind of thing they are using.

---

## What this is

A complete specification bundle for a third app in `business-mono`, alongside `apps/web`
(internal ops) and `apps/demo` (public, fixture-backed).

`apps/client` is the first surface BTS charges a subscription for and the first surface
anyone outside the founding team logs into. Access is invite-only; there is no sign-up form.

It is not a trimmed `apps/web`. The twenty-two route areas there are operations tooling and
almost none of it is client-shaped. This is a new app over shared spines.

---

## Document map

Read in this order.

| File | What it is |
|---|---|
| `README.md` | This file. Start here. |
| [`build-progress.md`](./build-progress.md) | **Read second.** The verification pass against the live database, and what building it changed. Several of the bundle's assumptions were wrong, one by an order of magnitude. |
| [`changelog.md`](./changelog.md) | What changed in this bundle and why. Amendments are recorded here rather than made silently. |
| [`assumptions.md`](./assumptions.md) | Twelve assumptions, ordered by blast radius, each carrying its verified answer. |
| [`client-app-mvp-spec.md`](./client-app-mvp-spec.md) | The main spec. Personas, product architecture, the security finding, data model, eight routes. |
| [`prepare-feature-spec.md`](./prepare-feature-spec.md) | `/prepare` in full — the differentiator. Template format, fact injection contract, six artefact outlines, local-only storage model. |
| [`sessions.md`](./sessions.md) | Three-session build plan with definitions of done. |
| [`../../../supabase/migrations/`](../../../supabase/migrations/) | The migrations. Execution source of truth, applied on push to `main` — see [`packages/db/MIGRATIONS.md`](../../../packages/db/MIGRATIONS.md). The bundle's reference `schema/*.sql` files were rewritten against the real schema; the result is listed in [`build-progress.md`](./build-progress.md). |
| [`.claude/skills/bts-design/references/naming.md`](../../../.claude/skills/bts-design/references/naming.md) | Naming rules, now in the design skill where the `bts-design` skill points at them. |
| [`../../../packages/data/src/repositories/client.ts`](../../../packages/data/src/repositories/client.ts) | `@platform/data` interfaces. Read-only by construction, with the conformance suite beside them. |

---

## Read this part even if you read nothing else

### There is a live security hole

Every RLS policy in `schema.sql` reads `USING (auth.role() = 'authenticated')`. That was
correct when "authenticated" and "founder" were the same two people.

**The moment a subscriber authenticates against this Supabase project, they can read the CRM,
the agent activity log, the compliance library and the contract library.**

The audit has been run against the live database, and the number is not eleven.

**114 permissive policies across 107 tables**, in two classes: 100 carrying the
`auth.role() = 'authenticated'` pattern, and a further 14 granting `USING (true)` to
`authenticated` — a class the bundle's own audit query does not detect, because it greps for
`auth.role()`. Fixing eleven and shipping a client login would have left ~98 tables readable.

The hardening migration covers all 114 and preserves the two policies that are deliberately
open. Details in [`build-progress.md`](./build-progress.md).

This migration is worth applying whether or not this app ever ships.

### The not-advice boundary is enforced by absence

`client_accounts` has no column capable of holding a subscriber's financial position. No fund
balance, no member details, no risk profile, no holdings.

BTS does not give financial advice and holds no AFS authorisation. Personal circumstances are
the ingredient that turns information into advice, so a service that cannot receive them
cannot give it. "We have no facility for you to tell us" is a true statement about the schema
rather than a promise about behaviour.

The same principle runs through `/prepare`: subscriber-authored prose lives in IndexedDB on
their device and is never transmitted, so the boundary becomes a fact about where bytes live.

### The register is precedent research, not securities analysis

`/register` exists for learning and for building your own treasury case. **Implementation
facts, not outcome facts.** Accounting treatment, custody model, board or deed authority,
disclosure wording and timing — all in. Current holding value, unrealised gain, share price
since announcement — all out.

**Cite in a pack** on every fact row carries it into a `/prepare` precedent section with its
provenance attached. That action is what makes the purpose legible from the interface rather
than from a disclaimer.

### No referral revenue, and it is a database constraint

The subscription is the business model. Directory listing is free, inclusion criteria are
objective and published, nobody can buy in or buy placement.

`no_fees_mvp` on `commercial_relationships` enforces it, because "we decided not to do
referrals" is a sentence someone forgets in eighteen months and a CHECK constraint is not.

The reasoning is recorded in the main spec so the question does not get reopened every quarter
by someone who has not read it. Short version: independence is the inventory, and ASIC INFO
269 treats a paid service commenting on financial products as more likely to be advising about
them — which matters more when there is no authorisation underneath.

### No client-facing agent

A trustee typing "should my fund hold 5%" into a chat box has asked for personal advice, and
any answer fluent enough to be useful is close enough to advice to be a problem.

Agents remain central and are all upstream: Lex classifies at ingest and reviews every
`/prepare` template, the findings engine narrates the brief, Rex scores the register entries.
By the time a subscriber opens the app, the agent work is done and committed.

A v2 shape exists — retrieval-only, returns cited passages rather than a composed answer,
refuses the second person. That is a real feature and it is not this.

---

## The eight routes

| Route | Purpose |
|---|---|
| `/` | The Brief. Narrated findings, quiet-day path honoured. |
| `/signals` | What changed at the vendors and registers that matter. |
| `/indicators` | Macro and on-chain series as reference data. |
| `/register` | Corporate bitcoin holders, cleared entries only. |
| `/directory` | Service providers, free listing, live regulatory status. |
| `/library` | Reference layer, sectioned by `client_type`. |
| `/prepare` | Board papers, trustee minutes, auditor evidence packs. |
| `/account` | Seats, disclosures, subscription. |

`/prepare` is why someone renews. Everything else is a well-made version of something a
determined CFO could assemble given a weekend they do not have.

---

## Design principles carried from the platform

These are not restated in every document. They apply everywhere.

- **Deterministic before LLM.** Facts commit before narration runs.
- **Compliance as schema, not UI copy.**
- **Quiet-day path is mandatory.** If nothing cleared the floor, say so.
- **Publish wall.** Only published content is readable by anything downstream.
- **Neutral delta colour.** No green-up, no red-down, on any metric. Gold is freshness only.
- **Absence is a fact.** State what is missing rather than leaving a gap.
- **Ticker is never a key.**
- **Computed over stored.** Derived metrics live in views.

---

## First three actions

1. ~~Run the audit query.~~ **Done** — 114 policies over 107 tables. The hardening migration
   covers all of them and is written but **not applied**; applying it is a deliberate act, not
   a side effect of merging. See [`build-progress.md`](./build-progress.md).
2. **Write the Service Statement.** Outstanding, and it is the single thing blocking first
   login: the gate serves it, and with none published nobody can pass.
3. **Confirm the not-advice position was assessed against Minute specifically** — a narrated
   brief, a register of named entities, monitoring of custody providers — rather than against
   the education and consulting business. Outstanding.

Only the first was code, and it is done.
