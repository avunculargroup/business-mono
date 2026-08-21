# Demo App — spec review and revised build plan

Reconciliation of the [`demo-app`](./README.md) spec bundle against the live repository, and
the revised session plan that follows from it. Same purpose as
[`docs/features/html-pdf-monitoring/build-progress.md`](../html-pdf-monitoring/build-progress.md).

**Status:** Phases 0–3 complete and merged to `main` (PR #368, `476878b`, 2026-08-19). All four
decisions settled, the scoping rule settled, all eight assumptions resolved, screenshot baselines
bootstrapped. Phase 4.0 (the `@platform/data` foundation) and verticals 4.1, 4.2a–b, 4.3, 4.4 and
4.5 and 4.6a are complete, and **Phases 5 through 9 have shipped** — the plan is complete through
its last numbered phase — `apps/demo` builds and serves all seven
surfaces on `@platform/data-fixtures`, with the curated fixture set behind them and the annotation
layer over them. **Two gates block
deployment: the ASIC search over the invented entity names, and the Lex classification pass over the
fixture prose** (Phase 6), and **the trace bundle is authored rather than recorded** (Phase 8).
**and the screenshot baselines need bootstrapping in the CI container** (Phase 9). Everything still
open in Phase 4 — 4.2c–d, 4.6b–d, 4.7–4.11 — is background whose justification rests on the client
app being real; the directors have it as not yet real but expected, so it is deferred rather than
cut.
**Last updated:** 2026-08-20

---

## Picking this up cold

Everything needed to continue is in this folder. In order:

1. **This file** — the decisions, the phase plan, and what each completed phase actually shipped
   (which differs from what it was specified to ship in several places; those deltas are recorded
   under each phase's *What shipped* heading).
2. **[`assumptions.md`](./assumptions.md)** — all eight original assumptions with their verified
   answers. Four were wrong, two fatally. Read before trusting anything in the other spec docs.
3. The four spec docs — reconciled against the repo in Phase 0, so their paths and table names are
   now real.

**The scoping rule is settled** — see *Consequence of decision 2* below. It was one sentence to
write now and would have been an audit of ~20 repository signatures later. Phase 4.0 implements it;
nothing before 4.0 is affected.

**Kill criteria matter here.** Phase 4 is 4–6 weeks with no user-facing output, justified by a
client app that was described as under consideration rather than committed. Checkpoints at
verticals 4.1 and 4.3 exist so that premise gets re-examined rather than assumed; they only work if
someone actually stops and looks.

**Outside this folder**, Phases 1–3 also changed: `packages/ui` (new), `apps/web/app/globals.test.ts`
(token guard), `e2e/` + `playwright.config.ts` + `.github/workflows/e2e.yml` (visual regression),
and `apps/web/docs/e2e-playwright-proposal.md` (marked partially implemented, with the shipped
subset described). `CLAUDE.md` carries the package list, import rules and testing conventions for
all of it.

---

## Why this document exists

The bundle in this folder was added in one commit and states its own limitation at
[`assumptions.md`](./assumptions.md):

> This bundle was written from feature specs, the design brief, and the platform schema. It
> was not written against the live repository.

This document records the verification pass. Checked against `schema.sql`, all 93 files in
`supabase/migrations/`, `packages/db/src/types/database.ts`, `apps/web/` and `apps/agents/`.

---

## Decisions

| # | Decision | Settled |
|---|---|---|
| 1 | **Surfaces** — compliance and contracts do not exist | **Re-pick from what is built.** They are neither built for real nor fixtured. |
| 2 | **Seam scope** — 81 files import the Supabase client | **Full seam across all of `apps/web`** (68 pages, 42 action files), not just demo surfaces. |
| 3 | **Trace subject** — no Simon run and no compliance workflow exist | **The `variant` workflow.** |
| 4 | **Branding** — public URL under an AFSL Authorised Representative | **BTS-branded, `noindex`.** Keeps the domain specificity, drops passive search discovery. |

### Consequence of decision 2 — scope

The full seam is the cleanest end state and makes every future demo page free, but it is the
majority of the work in this document and none of it is user-facing. Honest sizing: 68 pages,
42 server-action files, and roughly 40 existing tests that mock `@/lib/supabase/server` directly
and must be rewritten against repository fakes. Weeks, not days.

Two structural consequences follow, both handled in Phase 4:

- **It is built one domain at a time**, each vertical independently verifiable and committable, so
  there is never a long-lived branch carrying a half-migrated app.
- **The bundle must be splittable.** `apps/web` will have ~20 repositories; the demo renders 7
  surfaces. A monolithic `RepositoryBundle` would force `data-fixtures` to fixture domains nobody
  demos. So `packages/data` exports per-domain interfaces, `apps/web` composes the full bundle, and
  `apps/demo` composes a partial one typed to the slice its routes actually use. This is a change
  from [`repository-contract.md` § The bundle and provider](./repository-contract.md#the-bundle-and-provider), which specifies a single flat
  bundle.

**Auth stays on the raw client.** `middleware.ts` and the auth gate in `app/(app)/layout.tsx` are
not a repository concern and do not move. This matches the done-condition the original
build sequence set in [`README.md` § Build sequence](./README.md#build-sequence) — "returns
only the provider wiring and auth".

#### A third consumer is anticipated — scope at construction, never per call — **SETTLED**

A client-facing app reusing this UI is under consideration. That is the strongest case for the full
seam: one consumer makes it overhead, three make it infrastructure. It also forces one design rule,
settled here **before vertical 4.1**, because it is nearly free now and expensive to retrofit
across ~20 repositories.

The demo and a client app stress the seam along different axes. The demo swaps the **data source** —
same query, fixtures instead of Postgres. A client app swaps the **data scope** — same source,
restricted rows. The bundle as specced only solves the first.

**The rule: scoping belongs at bundle construction, never in a method signature.**
`createSupabaseRepositories(client, principal)` returns a bundle that cannot see rows outside its
principal. No read method ever takes a `clientId`, `tenantId` or equivalent parameter. A
`clientId` argument would put the security boundary in ~200 call sites, any one of which can pass
the wrong value; construction-time scoping means a caller has no way to ask the wrong question.

This is a constraint to hold, not a redesign — [`repository-contract.md` § The bundle and provider](./repository-contract.md#the-bundle-and-provider)
already builds the bundle from a per-request client.

**Closing the back door: `ReadContext` carries `asOf` and nothing else.** The rule as first stated
bans a `clientId` *parameter*, which leaves an obvious way to violate it in spirit — `ReadContext`
is already threaded through every read, so a `principal` or `clientId` field on it would put the
boundary back in ~200 call sites by another door, while every signature still looked compliant. So
the rule has two halves, and the second is the one that needs guarding: **no scoping data reaches a
repository through an argument of any kind, `ReadContext` included.** A principal is a constructor
argument or it does not exist.

**How it gets audited, defined now so it is cheap later.** Two mechanical checks, both in Phase 4.0
rather than retrofitted per vertical:

- A test in `packages/data` asserting the keys of `ReadContext` are exactly `['asOf']`. One
  assertion, and it fails the moment anyone widens the type — which is the only realistic way this
  rule gets broken quietly.
- A review grep for `clientId|tenantId|principal` under `packages/data/src/repositories/`, run
  alongside the existing grep for `mode`. Signatures are declared in one directory, so the audit of
  "~20 repository signatures" is a grep over that directory rather than a read of ~20 files.

Neither catches a Supabase adapter that simply forgets to apply its principal's filter. That is a
correctness bug in one file, caught by the contract suite; the rules above exist to stop it becoming
a class of bug spread across every call site.

Related: `mode` becomes `'live' | 'demo' | 'client'`. The review rule at
[`repository-contract.md` § The bundle and provider](./repository-contract.md#the-bundle-and-provider) — that branching on `mode` for anything
beyond chrome means the seam has failed — gets **stricter** with a third consumer, not looser. A
client app must differ by scope, never by branch.

**Two things the seam does not give you**, flagged so they are not discovered late:

- **RLS.** `CLAUDE.md` documents the current policy as "authenticated team members can read/write
  everything (two-person team)". A client-facing app invalidates that. Real policies and roles are
  database work; the seam surfaces the need but does not satisfy it, and defence in depth wants
  both layers.
- **Compliance.** [`assumptions.md` § Explicitly deferred](./assumptions.md#explicitly-deferred) currently rules a client app "out of
  scope entirely, and should stay out — it is a different audience with different compliance
  obligations". That reasoning still holds for *this* build; it now needs revisiting as a deliberate
  decision rather than being left to drift. Phase 0 should reword it from a prohibition to a
  deferral with the compliance question named.

### Consequence of decision 3 — the trace loses Signal

`variant` is web-gated, so [`demo-app-spec.md` § The approval channel](./demo-app-spec.md#the-approval-channel)'s inbound Signal
approval message is no longer what the trace shows. The replacement is better for a technical
evaluator: the web app cannot reach the agent server over HTTP, so `/content` writes
`content_items.pending_decision` and a Supabase Realtime listener claims it atomically before
resuming the suspended run. A real distributed-systems decision, visible in the trace.

`variant` was chosen over `strategy` despite having one gate rather than two, because its
`variant.compliance_check` step invokes Lex — which puts `compliance-as-alignment` inside the trace
rather than only in a static annotation, winning back some of what decision 1 removed.

### Consequence of decision 4 — deployment

`robots.txt` and a `noindex` meta tag, against
[`demo-app-spec.md` § Domain and indexing](./demo-app-spec.md#domain-and-indexing) ("robots.txt allows indexing. Being findable is the
point"). Update that line in Phase 0. Everything else in the deployment section stands: separate
Vercel project, `demo.btreasury.com.au`, no secrets in env, Open Graph card. The OG card still
matters — arguably more, since link-pasting is now the only distribution channel.

---

## Part 1 — Review

**Read this part as a record of what the bundle said before Phase 0, not as a description of it
now.** Several claims criticised below no longer appear in the docs they cite — Phase 0 corrected
them, which is what the review was for. The citations point at the section the claim lived in, so
they still land in the right place; the wording quoted is the original.

**On citations generally:** they name a section (`file.md § Section`), not a line number. Every
line-number citation in this document was stale by Phase 0, because that phase rewrote all five
spec docs and nothing updated the numbers pointing into them. Section anchors are checked by
`node scripts/check-doc-links.mjs`, which is CI-gated, so a renamed or deleted heading now goes red
instead of rotting quietly.

### What the bundle gets right

Keep these as written.

- **The relative-dating rule** ([`fixture-and-trace-schema.md` § The relative dating rule](./fixture-and-trace-schema.md#the-relative-dating-rule)).
  Offsets from `ReadContext.asOf` rather than absolute dates. Zero-maintenance staging.
- **`DemoWriteBlockedError` carrying the target table**
  ([`repository-contract.md` § Errors](./repository-contract.md#errors)), so the toast can name
  `content_items`. That specificity is the difference between a demo and a mockup.
- **The trace schema must not import `@mastra/core` types**
  ([`fixture-and-trace-schema.md` § Why a BTS-owned schema](./fixture-and-trace-schema.md#why-a-bts-owned-schema)). Correct, and more
  load-bearing than the doc knows.
- **The DM Sans / Inter typo is real.** `.claude/skills/bts-design/SKILL.md:17` says Inter;
  `docs/DESIGN_BRIEF.md:107` and `apps/web/app/globals.css:48` both say DM Sans. Verified.
- **The AFSL/AR compliance constraints**
  ([`demo-app-spec.md` § Compliance considerations](./demo-app-spec.md#compliance-considerations)) — no allocation figures, no real entities,
  no reproduced publisher content. Correct and non-negotiable.
- **One contract test suite both adapters must pass**
  ([`repository-contract.md` § Verification](./repository-contract.md#verification)). The only real defence against
  silent divergence.
- **Grep for `mode` during review** ([`repository-contract.md` § The bundle and provider](./repository-contract.md#the-bundle-and-provider)).
- **The non-goals section** ([`README.md` § Non-goals](./README.md#non-goals)) is disciplined. Preserve verbatim.

### Blocking finding 1 — two of the four flagship surfaces do not exist

[`demo-app-spec.md` § Surfaces to include](./demo-app-spec.md#surfaces-to-include) names four surfaces at "Full" demonstration depth.
Two are not built, in any form:

| Claimed | Reality |
|---|---|
| `compliance_obligations` | Does not exist. Not in `schema.sql`, not in any of 93 migrations, not in `database.ts`. |
| `contracts`, `contract_templates` | Do not exist. Zero column matches for `renewal`, `evergreen`, `notice_period`, `obligation` across all `.sql`. |
| `v_compliance_dashboard` | Does not exist. |
| `v_contracts_overview` | Does not exist. |
| `/compliance`, `/contracts` routes | Do not exist in `apps/web/app/`. |

[`repository-contract.md` § Design rules](./repository-contract.md#design-rules) instructs "Do not expose raw table rows.
The views already encode the computed fields" — for views that do not exist.
[`assumptions.md` § Resolved (4)](./assumptions.md#resolved) raises `v_contracts_overview` as an open question; the
answer is no. The contract as originally drafted said `daysUntilDecision` is
missing from the view; it is a two-level gap — the view must be created, not amended.

This matters because those surfaces carry the bundle's best material: the "key screen" fixture is
the engagement-letter decision deadline
([`fixture-and-trace-schema.md` § Narrative staging](./fixture-and-trace-schema.md#narrative-staging)), and the first required
annotation is the compliance urgency band ([`demo-app-spec.md` § Required annotations](./demo-app-spec.md#required-annotations)).

The bundle also rules out the obvious shortcut itself
([`assumptions.md` § Resolved (4)](./assumptions.md#resolved)):

> Do not build a fixture for a feature that does not exist in the real app — a demo showing
> something unbuilt is the one failure mode that is actually dishonest rather than merely awkward.

**Note on `schema.sql`:** it is a lagging reference. It documents 8 views where `database.ts` lists
23, and carries a stale `agent_activity.status` CHECK (missing `in_progress`, added by
`20260428130000`). Migrations win.

### Blocking finding 2 — the trace centrepiece has no subject

The two docs disagree, and both are wrong:

- [`README.md` § Build sequence](./README.md#build-sequence): "Record one Simon run end to end: proposal, suspend, human
  approval, resume, commit to `agent_activity`." **Simon cannot suspend** —
  `apps/agents/src/agents/simon/index.ts` is a Mastra `Agent`, driven by the Signal polling loop.
  Only workflows suspend.
- [`assumptions.md` § Resolved (6)](./assumptions.md#resolved): "the daily compliance workflow". **No such workflow.**
  The eight registered workflows (`apps/agents/src/mastra/index.ts:169-178`) are `recorder`, `pm`,
  `executeRoutine`, `pruneStorage`, `ecosystemScan`, `newsletter`, `variant`, `strategy`.

The real candidate is richer than what was specced. The **newsletter workflow**
(`apps/agents/src/workflows/newsletter/index.ts`) has two human gates — `gate1` at line 178,
`gate2` at line 538 — resumable from **both** Signal (`listeners/newsletterGate.ts`) and web
(`listeners/newsletterGateWeb.ts`, via `newsletter_runs.pending_decision`), committing at the
`persist` step (line 646) to `content_items` plus an `agent_activity` row carrying
`workflow_run_id`.

[`assumptions.md` § Resolved (6)](./assumptions.md#resolved) sends the recorder author to
`node_modules/@mastra/core/dist/docs/`; `node_modules` is not installed in a fresh checkout, so
that check needs `pnpm install` first. More usefully, **the hook already exists and is already in
use**: `spanOutputProcessors` on the `Observability` config (`apps/agents/src/mastra/index.ts:103-120`),
with `apps/agents/src/observability/agentActivityProcessor.ts` as a working reference. A recorder is
a second `SpanOutputProcessor` — no workflow instrumentation needed.

One trap: that file hardcodes `VALID_AGENT_NAMES` at line 19 and silently drops spans for `lex`,
`editor`, `marketAnalyst` and `newsVerifier`. Do not copy the filter into the recorder.

Pinned: `@mastra/core ^1.54.0`, `@mastra/observability ^1.16.3`.

### Blocking finding 3 — Session 1 is 3.5x its own abort threshold

[`assumptions.md` § Resolved (2)](./assumptions.md#resolved) sets the test: if more than ~30 files touch Supabase,
split Session 1. Measured:

| Metric | Count |
|---|---|
| Files containing `createClient` | 105 |
| Non-test files importing `@/lib/supabase` | 81 |
| Files with a real `.from(` call | 54 |
| `page.tsx` files fetching inline | 47 of 68 |
| Server-action files in `app/actions/` | 42 |
| `*.module.css` files | 128 |
| Component subdirectories | 26 |
| Existing web tests, many mocking Supabase directly | 72 |

`app/(app)/layout.tsx` queries Supabase itself. `middleware.ts` constructs a fourth client inline.
`app/actions/company.ts` alone has 21 `.from(` calls.

This is a multi-week refactor of working production code with no user-facing benefit, placed first
and gating everything ([`README.md` § Build sequence](./README.md#build-sequence)).

### Non-blocking corrections

1. **Every path and package name is wrong.** `apps/hq` → `apps/web`; `@bts/*` → `@platform/*`.
   Existing packages are `db`, `shared`, `signal`, `voice` — `voice` is undocumented in `CLAUDE.md`
   too. Shell commands at [`assumptions.md` § Resolved (2)](./assumptions.md#resolved) and
   [`README.md` § Build sequence](./README.md#build-sequence) do not run as written.
2. **The token source claim is wrong.** [`README.md` § Architecture in one paragraph](./README.md#architecture-in-one-paragraph) names
   `.claude/skills/bts-design/` as canonical. The implementation source of truth is
   `apps/web/app/globals.css` (74 custom properties, header comment cites `docs/DESIGN_BRIEF.md`).
   The skill's `colors_and_type.css` is a third copy, already drifted. Exact figures,
   computed in Phase 1 and now enforced by `apps/web/app/globals.test.ts`: 6 tokens in globals
   are missing from the skill (`--color-accent-glow`, `--color-surface-active`,
   `--color-warning-subtle`, `--press-scale`, `--safe-area-bottom`, `--tap-highlight`), 1 exists
   only in the skill (`--color-agent-pending`), and all 3 font tokens differ in their fallback
   chains while agreeing on the primary family. Three copies, drift in both directions, plus the
   font typo.
3. **`ReadContext.asOf` has an asymmetric cost.** It buys the demo stale-proof fixtures and buys
   `apps/web` nothing, while adding a parameter to every call site. Keep it, but default it in the
   Supabase adapter so `apps/web` call sites can omit it.
4. **"Every method is async … otherwise the demo's loading states never exercise"**
   ([`repository-contract.md` § Design rules](./repository-contract.md#design-rules)) does not hold. In RSCs an async
   fixture read resolves in the same tick and `loading.tsx` never paints. There are 31 `loading.tsx`
   files in `apps/web`, so if exercising loading states is wanted the fixture adapter needs a
   deliberate delay, not merely an `async` keyword.
5. **No Tailwind.** [`assumptions.md` § Resolved (3)](./assumptions.md#resolved) offers "a Tailwind config, a CSS
   variables file, or both". It is CSS Modules plus CSS custom properties, no PostCSS anywhere.
6. **No `vercel.json` in the repo**, so [`assumptions.md` § Resolved (7)](./assumptions.md#resolved) cannot be
   answered from the tree — deploy config is dashboard-side. `apps/web/next.config.ts` carries only
   `transpilePackages: ['@platform/db', '@platform/shared']`, the load-bearing line any new package
   must join.
7. **CI blast radius is understated.** [`demo-app-spec.md` § Open questions](./demo-app-spec.md#open-questions) frames the
   shared gate as an open question. It is not opt-in: `.github/workflows/test.yml` runs
   `pnpm typecheck`, `pnpm lint` and `pnpm test` across the workspace, so `apps/demo` joins the gate
   the moment it exists.
8. **Package config is hardcoded in two places.** `apps/web/package.json`'s lint script lists
   `--dir app --dir components --dir hooks --dir lib --dir providers`, and
   `apps/web/vitest.config.ts` scopes includes to those same dirs with explicit `resolve.alias`
   entries. Both need editing for any extraction; tests moved into a package fall outside the globs.
9. **`temp.md`** was a one-line placeholder asking to be deleted on the next session. Removed.

---

## Part 2 — Revised plan

### Re-picked surfaces

Seven of the eight required annotations ([`demo-app-spec.md` § Required annotations](./demo-app-spec.md#required-annotations)) have a
home in shipped code. Only the contracts notice-period annotation dies with contracts.

| Surface | Depth | Route(s) | Principle | Backing |
|---|---|---|---|---|
| Market reports | Full | `/market-reports`, `/market-reports/[id]` | `deterministic-before-llm`, `quiet-day-path` | `apps/agents/src/lib/findings/materiality.ts` and computors compute findings; `marketAnalyst` narrates a ≤50-word intro over the committed payload only |
| Research feed | Full | `/news`, `/news/[id]` | `curator-notes` | `news_items.curator_notes`, `relevance_score`, `rex_metadata` (`material`/`novelty`/`citation`, composite `×0.5/×0.3/×0.2` — `workflows/newsRubric.ts:72-74`); `transcript_segments` for podcast provenance |
| Agent activity + approval | Full | `/activity`, `/agents/run/[traceId]` | `hub-and-spoke` | `agent_activity` with `proposed_actions`/`approved_actions`; `apps/web/app/actions/approvals.ts` |
| Content pipeline | Full | `/content` | `publish-gate` | `content_items.status` `idea→draft→…→published`; `content_embeddings` written on publish by `contentEmbeddingListener` |
| Dashboard / indicators | Glance | `/` | `neutral-delta-colour` | `v_indicator_latest`, `v_onchain_dashboard` |
| Ecosystem signals | Glance | `/signals` | `compliance-as-alignment` | `ecosystem_changes.compliance_class`; Lex gates via `content_items.compliance_status` |
| CRM | Glance | `/crm/companies` | — | `v_contacts_overview` |

Market reports is a straight upgrade on the dropped compliance surface: it carries the two
principles the spec cared most about, and it is real.

### Critical path

The demo is the deliverable; the seam is how it gets built. Phase 4 is by far the longest phase and
most of it is invisible, so the ordering below is deliberate: **the demo only depends on verticals
4.1–4.6.** Everything from 4.7 on is background work that must never block a later phase.

```
0 → 1 → 2 → 3 → 4.0 → 4.1‥4.6 → 5 → 6 → 7 → 8 → 9        ← critical path
                       └ 4.7‥4.11 ─────────────────────→   ← background, non-blocking
```

**Kill criteria.** Check at the end of vertical 4.1 and again at 4.3. If 4.1 takes more than double
its estimate, the full-seam assumption behind decision 2 is wrong for this codebase — stop and
re-cut to demo surfaces only, which is decision 2 option (a) and costs nothing already spent. If the
client app has not firmed up by the end of 4.6, revisit whether 4.7–4.11 are worth finishing at all;
the demo does not need them.

**The premise checkpoint came due at 4.6a, not at the end of 4.6.** The demo's last surface is
`/crm/companies`, so everything after 4.6a — 4.2c–d, 4.6b–d and 4.7–4.11 — is background, and the
question the checkpoint asks now covers **all** of it rather than just 4.7–4.11. Restated with what
is known: 4.1–4.6a took far less than the 4–6 week estimate for Phase 4, so the sunk cost the
premise has to justify is small; what remains is roughly 150 `.from(` calls across eight
sub-verticals, none of which the demo renders. The answer is a commercial fact about whether the
client app is real, which is the directors' to supply, not this document's to assume. What the
document can say is that stopping here costs the demo nothing.

**What actually rests on the client app — measured, because the framing above overstates it.**
"Phase 4 is 4–6 weeks justified by a client app" reads as though the whole phase is a bet on that
app. It is not. 4.1–4.6 are on the demo's critical path and would be built under decision 2 option
(a) as well; only 4.7–4.11 exist because of the third consumer. Splitting the ~202 `.from(` calls in
`app/actions/` and the 67 `page.tsx` files across the eleven verticals: 4.1–4.6 carry 114 calls and
38 pages, 4.7–4.11 carry 88 and 29. So the client-app premise governs a little under half of Phase
4, not the whole of it, and it does not gate starting 4.1 — the demo does.

Two consequences. The premise checkpoint belongs at 4.6, where the doc already puts it, and the
4.1/4.3 checkpoints are about *effort* — is the full-seam approach working in this codebase —
which is a different question with a different answer. And the decision that genuinely needs the
premise before 4.0 is narrower than the phase: composable per-domain bundles and construction-time
scoping are there for the third consumer. Under demo-only scope `apps/web` would carry the same
seven domains the demo renders, and a single flat bundle would do.

### Phase 0 — Reconcile the bundle and verify infra (½ day, no code)

- Rewrite all five docs against the real repo: `apps/web`, `@platform/*`, real routes and tables.
- Replace the surface table at [`demo-app-spec.md` § Surfaces to include](./demo-app-spec.md#surfaces-to-include) and the staging table
  at [`fixture-and-trace-schema.md` § Narrative staging](./fixture-and-trace-schema.md#narrative-staging) with the re-picked set.
- Correct [`README.md` § Build sequence](./README.md#build-sequence) and [`assumptions.md` § Resolved (6)](./assumptions.md#resolved) to the
  `variant` workflow and the `SpanOutputProcessor` hook.
- Flip [`demo-app-spec.md` § Domain and indexing](./demo-app-spec.md#domain-and-indexing) from "robots.txt allows indexing" to `noindex`,
  per decision 4.
- Reword [`assumptions.md` § Explicitly deferred](./assumptions.md#explicitly-deferred) from "client app out of scope entirely, and
  should stay out" to a deferral naming the compliance question, per decision 2.
- Widen `SuspendStep.channel` in [`fixture-and-trace-schema.md` § Schema](./fixture-and-trace-schema.md#schema)
  from `'signal'` to `'signal' | 'web'`.
- Mark each verified assumption in [`assumptions.md`](./assumptions.md) resolved, with its answer.
- Fix `.claude/skills/bts-design/SKILL.md:17` Inter → DM Sans.
- **Verify the two outstanding infra assumptions** — both now closed. `demo.btreasury.com.au` is
  unclaimed (NXDOMAIN) and `hq.btreasury.com.au` already resolves to Vercel, so the hostname split
  the spec relies on is real. The existing Vercel project's Root Directory is `apps/web`, so adding
  `apps/demo` cannot change what it builds. Recommended demo project settings are recorded in
  [`demo-app-spec.md`](./demo-app-spec.md) → Deployment.

**Verify:** every path in the bundle resolves; every table and view named exists in
`packages/db/src/types/database.ts`.

**Status: complete.** All five docs reconciled, all eight assumptions resolved, the DM Sans typo
fixed at source, and no stale `apps/hq` or `@bts/*` references remain outside the resolution
records.

### Phase 1 — Visual regression baselines (1 day)

**Runs before any extraction.** Baselines must be captured from the current state, or they cannot
prove the token and component moves in Phases 2–3 were inert. Capturing them afterwards proves
nothing.

Scope is deliberately far narrower than
[`apps/web/docs/e2e-playwright-proposal.md`](../../../apps/web/docs/e2e-playwright-proposal.md),
because this plan sidesteps that proposal's two hardest problems. Its §2 and §4 wrestle with "every
page depends on Supabase data, so E2E needs a backend that answers", solved via `page.route` stubs
mirroring Supabase's wire format plus hand-rolled auth-cookie injection. Neither is needed here:

- **Now:** snapshot the 19 static specimen pages already in
  `.claude/skills/bts-design/preview/*.html`. No auth, no server, no Supabase, no stubs.
- **From Phase 5:** snapshot `apps/demo`, which is public and fixture-backed — the proposal's
  backend problem does not exist there either.

So `e2e/fixtures/auth.ts` and `e2e/fixtures/supabase.ts` — the two hardest files in the proposal —
are never written.

This answers the proposal's §10 open questions for our purposes: primary goal is **visuals**, not
journeys; **no** Option B local-Supabase stack; **advisory** CI posture; **Chromium only**;
**primitives plus, later, the demo's seven surfaces**.

#### What shipped, and how it differs from the above

The phase split in two once it met the code. Token drift turns out to be a **static text
property** — it needs no browser at all — so forcing it through Playwright would have put the
precise check in the slow, flaky, advisory lane. The split:

**1. `apps/web/app/globals.test.ts` — token guard, Vitest, in the blocking gate.**
Parses the `:root` blocks of `globals.css` and the skill's `colors_and_type.css` and asserts a
hand-maintained canonical map of all 74 tokens, plus the exact drift between the two sources.
Runs in ~20ms inside the existing `pnpm test`. This — not the screenshots — is the real safety net
for Phase 2.

Vitest's own file snapshots are *not* used: they are unused elsewhere in this repo and hit a
`SnapshotClient` error under the `test.projects` split in `vitest.config.ts`. The config was left
alone rather than restructured for one file, and an explicit literal is better here anyway — a
74-entry `.snap` blob is not something anyone reviews carefully, whereas a changed hex shows up in
a diff as a changed hex.

*Drift figures corrected while writing it.* The earlier estimate in non-blocking correction 2 was
taken from an exploration summary rather than computed, and was wrong. Verified: 6 tokens in
globals are missing from the skill, 1 exists only in the skill, and all 3 font tokens differ in
their fallback chains while agreeing on primary family.

**2. `e2e/design-system.spec.ts` — screenshots, Playwright, advisory.**
Root-level `playwright.config.ts` and `e2e/`, not `apps/web/e2e/` as the proposal suggested — this
suite never tests `apps/web`, only the static specimens now and `apps/demo` from Phase 5.
`@playwright/test` is a root devDependency; `pnpm test:visual` is separate from `pnpm test`.

Google Fonts requests are **blocked** in the spec. Left alone, each test spent ~13s fetching
webfonts — two minutes for the file — and the suite depended on a third-party CDN being up.
Blocking takes it to 8.8s total and makes it hermetic. The cost is that type specimens render in
the fallback stack, so this suite does not prove the webfonts load; that is the right trade, since
the font decision is asserted exactly in the token guard and what these screenshots cover is
layout, spacing, colour and cascade. It also matches the demo's own constraint of working with the
network disabled.

Coverage caveat worth knowing: 14 of the 18 specimens are fully `var()`-driven, but the four colour
swatch cards hardcode their chip fills as hex and only *label* them with the token name. Those
chips will not catch a changed token — their surrounding chrome will, and the token guard covers
the values exactly.

**3. `e2e/tokens-resolve.spec.ts` — computed-style assertions, no baselines needed.**
Added when the baseline bootstrap was deferred. It closes the one gap the Vitest guard structurally
cannot cover: a token that is correct in a file but never reaches the browser because an `@import`
path broke. The Vitest test reads files from disk; this reads `getComputedStyle` in Chromium.

That is precisely the Phase 2 risk — three import chains change at once when the tokens move into
`@platform/ui`. Being assertion-based rather than image-based, it is deterministic across machines
and container images, so it works today and runs as its own step in `e2e.yml`, ahead of the
screenshots.

Verified non-vacuous by deliberately breaking the `@import` in `_base.css`: all four tests fail,
and pass again when restored. That exercise caught a real weakness — the "no token resolves to
empty" test originally passed *while the import was broken*, because with no tokens defined the
filter it asserts on is trivially empty. It now asserts a count floor first.

**Baselines bootstrapped** (`7f74567`) — all 18 specimens, generated in the
`mcr.microsoft.com/playwright:v1.62.1-noble` container so they match CI. Verified: the baseline
filenames match the specimen set exactly, none missing and none orphaned.

They were captured *after* Phases 2 and 3 rather than before, so they cannot do the job originally
scheduled — proving those extractions were inert. They lock in the current state, which was eyeballed
first. From here on they serve their intended purpose.

**A finding from the bootstrap: blocking webfonts trades a network dependency for a host-font one.**
Running the suite outside the container fails on `colors-neutrals` at ~2% pixel drift. Investigated
rather than waved off, since a 2% diff on a colour card looks like a token regression. It is not:
the chips are hardcoded hex in the specimen HTML and cannot change from a token edit, and the diff
image shows horizontal *displacement*, not colour.

The mechanism: with Google Fonts blocked, `--font-mono` falls through `'SF Mono'`, `Menlo`,
`Consolas` to generic monospace, and each host resolves that differently. Different glyph metrics
shift label widths, which accumulate across a row. `colors-neutrals` has the most swatches (7) and
the longest labels, so it drifts furthest; the three-swatch colour cards stay under threshold. Phase
2's adoption of the skill's longer fallback chains slightly widened this, which is a fair price for
better production rendering.

No code fix — CI is one fixed container, so it is consistent there. But it is a footgun for anyone
running the suite on a laptop and concluding they broke something, so **`pnpm test:visual` now runs
inside the container image too**, matching `test:visual:update`. `test:visual:local` remains for a
raw run, with the caveat documented in the spec.

**Status: complete, pending baseline bootstrap.** Token guard green in the blocking gate
(`pnpm test`: 73 files, 502 tests). Screenshot specs verified working locally — 19 passed in 8.8s —
against a browser override, but those images were discarded rather than committed because they
would diff against CI.

**Verify:** suite green twice in a row in CI on an unchanged tree. A flaky baseline is worse than no
baseline.

### Phase 2 — `@platform/ui`, tokens (1 day)

- Create `packages/ui` with `src/tokens.css` as the single source, moved from
  `apps/web/app/globals.css`. `globals.css` keeps only app-level resets.
- Bring `.claude/skills/bts-design/colors_and_type.css` to parity, resolving the drift recorded in
  non-blocking correction 2. Leaving it deferred means every future UI task is calibrated off a
  stale file.
- Add `@platform/ui` to `transpilePackages` in `apps/web/next.config.ts`.

#### What shipped

**`packages/ui/src/tokens.css` is canonical — 75 tokens.** `apps/web/app/layout.tsx` imports it
ahead of `globals.css`, which drops from 224 lines to 123 and now contains no `:root` block at all.
Verified in the emitted bundle rather than by assuming: all 75 custom properties appear in
`.next/static/css`, including both changes below.

**The skill copy is a copy, not an `@import` — a deliberate deviation from the plan above.**
`SKILL.md` documents copying the skill's assets *out* of the repo to build standalone artifacts,
and `preview/_base.css` loads the CSS directly over `file://`. A path reaching into `packages/ui`
would break both the moment anything left the repo. So the two files stay independent and are held
identical *mechanically*: `apps/web/app/globals.test.ts` now asserts `sorted(skillTokens)` equals
`sorted(uiTokens)` outright, and separately asserts the skill keeps its own Google Fonts import and
grows no `@import` of the package. Drift is impossible without a red build, which was the actual
goal — deduplication was only ever the means.

**Two intentional value changes**, so this move is not purely inert:

- `--color-agent-pending: var(--color-surface-subtle)` existed only in the skill. Rather than delete
  it, the package adopts it, so `apps/web` gains one unused token. It pairs with the `pending`
  value in `agent_activity.status`, so it is plausibly wanted; noted as currently unreferenced.
- All three font tokens adopt the skill's longer fallback chains — `-apple-system`, `'Segoe UI'`,
  `'Times New Roman'`, `'SF Mono'`, `Menlo`, `Consolas`. `apps/web` inherits better rendering when
  a webfont fails to load. Primary families are unchanged, so this is invisible on any machine
  where the webfonts load.

**Deferred to Phase 3, deliberately.** The plan listed a `resolve.alias` entry in
`vitest.config.ts` and a `--dir` addition to the lint script. Neither is added: the package is
CSS-only today, so there is nothing to alias and nothing to lint, and pointing `apps/web`'s lint at
`../../packages/ui/src` would have a package linted by its consumer rather than by itself. Both
land in Phase 3 with the components, when they do something.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` (73 web files / 501
tests, 138 agent files / 1200 tests) and `pnpm --filter @platform/web build` all green.
`e2e/tokens-resolve.spec.ts` green, which is the meaningful one here: it proves the tokens still
resolve through the specimen `@import` chain in a real browser after the move.

The screenshot suite's "zero diffs" check was **not** available — baselines are still to be
bootstrapped. So a layout shift that changes no token value would not have been caught by
automation in this phase.

**Status: complete.**

### Phase 3 — `@platform/ui`, components (2–3 days)

- Move the 24 components in `apps/web/components/ui/` (each `X.tsx` + `X.module.css` + `X.test.tsx`)
  into `packages/ui/src/`.
- Keep deep imports; add no barrel (the repo has none anywhere).
- Give `packages/ui` its own `vitest.config.ts`.

#### What shipped

**"No Supabase coupling — this is the clean part" was wrong.** The survey found
`components/ui` reaching into four app-level modules, so moving the components alone would have
left the package importing its own consumer. Split into two commits as a result.

**3a — the shared primitives.** `cn` (out of `lib/utils`, which keeps its app formatting helpers),
`useFocusTrap` (sole consumer was `SlideOver`), and `ToastProvider`. The last is the significant
one: 80 importers, zero dependencies beyond React, and **`apps/demo` needs it** — the write-blocked
toast naming the real table is a specced feature, so a toast system is UI infrastructure and
belongs in the package.

`packages/ui` became a real TypeScript package here: `tsconfig.json`, its own `vitest.config.ts`
(jsdom throughout, no node/jsdom split — every component renders), and its own `test/setup.ts` kept
as a copy rather than shared, since a package reaching into its consumer's test helpers is the
coupling this work removes. React and `lucide-react` are peer dependencies so both apps supply one
copy.

*Caught by grepping for leftovers:* eight test files call `vi.mock('@/providers/ToastProvider')`.
Those are mock **targets**, not imports — left unrewritten they would have silently stopped
intercepting, and the tests would have exercised the real provider while still reporting green.

**3b — the components.** All 49 files moved, intra-package imports converted to relative, and 155
import sites rewritten from `@/components/ui/*` to `@platform/ui/*`.

Two things only the real build caught, after typecheck, lint and tests were all green:

- **CSS Module type declarations.** `apps/web` gets these implicitly from `next-env.d.ts`; a
  package consumed via `transpilePackages` does not. Added `src/css-modules.d.ts`.
- **`Form.module.css` is consumed across the package boundary** by 14 `apps/web` components — a
  pre-existing pattern, previously `@/components/ui/Form.module.css`. The `"./*": "./src/*.tsx"`
  export mapped it to `Form.module.css.tsx` and webpack failed on all 14. Fixed with an explicit
  `"./Form.module.css"` export rather than a `"./*.module.css"` wildcard, so sharing a stylesheet
  stays a deliberate interface decision instead of making every internal CSS module public.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and
`pnpm --filter @platform/web build` (compiled, 46 pages) all green, plus
`e2e/tokens-resolve.spec.ts`.

Test accounting reconciles exactly: `apps/web` went 73 files / 498 tests → 59 / 419, and
`@platform/ui` 1 / 3 → 15 / 82. 419 + 82 = 501, unchanged from before the move.

The screenshot suite's zero-diff check was unavailable at the time, baselines being still
unbootstrapped. That mattered more here than in Phase 2 — moving 24 components with their CSS
modules is exactly the kind of change screenshots catch and assertions do not. The gap was closed
by a manual walk-through of the app before the baselines were captured in `7f74567`; those
baselines lock in the post-move state rather than proving the move was inert.

**Status: complete.**

### Phase 4 — `@platform/data`, full seam (4–6 weeks)

Per decision 2, every page and server action in `apps/web` moves behind repository interfaces. Built
as independent domain verticals so the app is shippable at every commit.

**Safety net.** Playwright is largely the *wrong* tool for this phase — the risk here is data
wiring, not layout. A dropped filter, a wrong `.order()`, a broken pagination boundary: screenshots
barely catch those. The net is the contract test suite below, plus per-vertical RSC tests using the
existing `test/mocks/supabase.ts` pattern that `app/(app)/crm/companies/page.test.tsx` already
establishes.

**Rollback posture — a stated acceptance, not an omission.** There is no feature flag and no
parallel-run. Reverting vertical 4.4 means reverting 4.5 and 4.6 on top of it. For a two-person team
on an internal tool this is judged acceptable; the mitigation is that each vertical is small,
independently verified, and committed before the next begins. If that stops being acceptable — say,
once a client app has real users — the posture must change before, not during, the next vertical.

#### 4.0 — Foundation (2–3 days)

- `packages/data` — `context.ts` (`ReadContext`, `QueryOptions`, `Paginated`), `errors.ts`
  (`DemoWriteBlockedError`, `NotFoundError`), the per-domain interface convention, and the
  composable provider. Interfaces only, no implementations.
- Implement the settled scoping rule (see decision 2): scoping lives at bundle construction, never
  in a method signature and never on `ReadContext`. Includes the `ReadContext`-keys test, so the
  rule ships with its guard rather than as prose.
- The contract test harness from [`repository-contract.md` § Verification](./repository-contract.md#verification),
  written once and parameterised over an adapter, so each vertical adds its cases rather than its
  own harness.
- `packages/data-supabase` scaffold. `ReadContext.asOf` defaults to `new Date()` here so `apps/web`
  call sites can omit it.
- Mount the provider alongside `UserProvider` / `ToastProvider` in `apps/web/app/(app)/layout.tsx`.
  `UserProvider` types straight off `@platform/db` — flagged, not fixed.
- Convert `lib/action.ts:getAuthedClient()` to hand back a repository bundle rather than a raw
  client. Doing this first makes every subsequent vertical smaller.
- Add the new packages to `transpilePackages`, the vitest `resolve.alias` map, and the lint `--dir`
  list.

##### What shipped

**`packages/data` is complete and `packages/data-supabase` is a real scaffold, but three of the
listed items moved to 4.1** — the bundle factory, the `getAuthedClient` conversion, and the provider
mount. All three need a domain to be more than a no-op: `createSupabaseRepositories` with zero
domains returns `{ mode: 'live' }`, `getAuthedClient` would hand back that empty bundle while every
action still used the raw client, and a mounted provider nothing calls `useRepositories()` against
proves nothing. Shipping them empty would have been scaffolding that CI cannot exercise. They land
with 4.1's first domain, which is the commit that makes them non-vacuous.

What `data-supabase` does carry is the part that is real without a domain: `createAdapterContext`,
which binds client and principal at construction and freezes them, and `resolveReadContext`, which
defaults `asOf` so `apps/web` call sites can omit it. The scoping mechanism is in place before the
first repository exists, which was the point of settling the rule early.

**The scoping guard has two locks, and both were verified by breaking them.** Adding a `clientId`
field to `ReadContext` fails `tsc` on `READ_CONTEXT_KEYS_ARE_EXHAUSTIVE`; widening
`READ_CONTEXT_KEYS` to make `tsc` pass then fails `context.test.ts`. Checked by doing exactly that
and watching each fire in turn — the Phase 1 lesson about a guard that passes while the thing it
guards is broken applies here more than anywhere, since this one protects a security boundary.

**A finding the contract doc does not cover: the bundle cannot cross the RSC boundary.**
[`repository-contract.md`](./repository-contract.md) says "both apps mount the same provider with a
different bundle", which reads as though the server layout builds the bundle and passes it down. It
cannot — a bundle is an object of methods, and functions are not serialisable across the React
Server Component boundary. The working shape is two layers: each app owns a thin `'use client'`
wrapper that receives *serialisable* inputs (a `Principal`, an anchor date) from its server layout,
constructs its bundle inside the client boundary, and mounts `@platform/data`'s provider with it.
Server components and server actions never touch the provider at all — they call the adapter factory
directly, per request. This is why `apps/web` needs 7 browser-client call sites converted in their
verticals, not just the server ones. Recorded in the provider's docblock.

**The React provider needed its own subpath export.** Re-exporting `provider.tsx` from
`@platform/data`'s root index broke `tsc --noEmit` in `@platform/data-supabase`, which has no React
and no `jsx` setting and was being handed JSX it never asked for. It is now
`@platform/data/provider`, mirroring how `@platform/db` splits `./server` and `./browser`. Worth
knowing before `data-fixtures`: any React-touching module in these packages needs the same
treatment.

**Two wiring details.** The vitest alias map is order-sensitive — Vite's object form does prefix
matching, so `@platform/data-supabase` and `@platform/data/provider` must be listed *before*
`@platform/data` or the shorter key claims them. And the lint `--dir` addition was **not** made, for
the reason Phase 2 gave: pointing `apps/web`'s lint at `../../packages/data/src` would have a
package linted by its consumer. Both packages lint themselves via `tsc --noEmit`, same as every
other package.

**Verify — what was actually run.** `pnpm typecheck` (13 tasks), `pnpm lint` (8 tasks), `pnpm test`
(10 tasks) and `pnpm --filter @platform/web build` all green. New suites: `@platform/data` 4 files /
16 tests, `@platform/data-supabase` 1 / 4. `apps/web` unchanged at 62 / 483 — nothing in the app
imports the new packages yet, which is the honest reading of this commit: the wiring is declared and
compiles, and 4.1 is what exercises it.

**Status: complete, with the three items above carried into 4.1.**

#### 4.1 onwards — One vertical at a time

Each vertical: define its interface, implement it in `data-supabase`, convert its pages and its
server actions, rewrite its tests against a repository fake instead of the Supabase mock, verify,
commit.

| # | Vertical | Routes | Demo? |
|---|---|---|---|
| 4.1 | Agent activity + approvals ✅ | `/activity` | Yes — smallest, proves the pattern |
| 4.2 | Research and podcasts | `/news/*` (12 pages) | Yes — largest read surface. Split: **4.2a feed ✅**, **4.2b detail + reports ✅**, 4.2c podcasts, 4.2d collections + sources |
| 4.3 | Content and campaigns ✅ | `/content/*`, `/campaigns/*` | Content only — `/campaigns/*` is not a demo surface |
| 4.4 | Market reports, indicators, onchain ✅ | `/market-reports/*`, `/` | Yes |
| 4.5 | Ecosystem signals ✅ | `/signals` | Yes |
| 4.6 | CRM and company | `/crm/*` (11 pages), `/company` | Yes (`/crm/companies` only). Split: **4.6a companies ✅**, 4.6b contacts + interactions, 4.6c company records, 4.6d champions/personas/segments/interviews/community. Only 4.6a is a demo surface |
| — | *critical path ends; below is background* | | |
| 4.7 | Discovery | `/discovery/*` | No |
| 4.8 | Projects, tasks, files, docs | `/projects/*`, `/tasks/*`, `/files`, `/docs/*` | No |
| 4.9 | Products, advisors | `/products/*`, `/advisors/*` | No |
| 4.10 | Decks and slides | `/decks/*` | No |
| 4.11 | Settings, routines, brand, simon | `/settings/*`, `/routines`, `/brand`, `/simon` | No |

**Watch items.** `app/actions/company.ts` has 21 `.from(` calls, `campaigns.ts` 17, `decks.ts` 15 —
the heavy three, and none should be first. `hooks/useRealtimeSubscription.ts` is the one
Supabase-coupled hook; Realtime has no fixture equivalent, so the demo will need it to no-op.

##### 4.1 — Agent activity + approvals: what shipped

Converted: `/activity`, `app/actions/approvals.ts`, and the pending-count query in
`app/(app)/layout.tsx`. Plus the three 4.0 items that were waiting for a domain —
`createSupabaseRepositories`, the `getAuthedClient` equivalent, and the provider mount.

**A vertical is not a table.** `agent_activity` is read from six places: `/activity`, `/simon`,
`/settings/integrations/fastmail`, the layout badge, and two CRM actions that insert into it. 4.1
owns the interface, the implementation, and its own three call sites; the rest convert in 4.6 and
4.11. What made that possible without a half-migrated app is that the *card* moved to the read model
and the unconverted pages map at the query boundary with the adapter's exported
`toAgentActivityItem`. Those two call sites become deletions when their verticals land rather than
rewrites. Expect this shape to repeat — few tables belong to exactly one vertical.

**The contract as specced did not survive contact with the data.** Three corrections, all in favour
of what is real:

- **`ProposedAction` is not a struct.** [`repository-contract.md`](./repository-contract.md)
  specifies `{ id, summary, targetTable, severity }`. *No producer writes that.* Eight write to the
  column, in eight shapes — `{ type: 'variant', platform, is_thread }`, `{ type: 'create_task',
  title, due_date, assignee }`, `{ kind: 'suggested_rewrite', body }` and so on. So the read model
  types the *conventions* they share rather than any one shape: a discriminator (`type`, or `kind`
  for Lex's entries) and a label (`description`, `title` or `name`). See the rendering fix below,
  which is what forced this from three guessed fields into two real ones.
- **One read model, not summary + detail.** The list renders the same card a detail view would,
  proposed actions and all, so a lean `AgentActivitySummary` would be re-fetched
  immediately. There is no `/activity/[id]` route and no `getActivity` method until something needs
  one.
- **`countPending` is a method.** The contract has no equivalent; the layout badge needs a count and
  never reads the rows, so a `listActivity` call to take `.total` would fetch 25 rows to render a
  number.

**Contract suite reach — an honest limit, and how it was fixed.** The pagination cases cannot run
against a Supabase adapter backed by a stub that returns one canned response whatever the range:
they would only prove a stub returns its stub. Rather than concede the suite to the fixture adapter
alone, the package's Supabase fake grew `__setRows`, so `.range(from, to)` really slices and the
count reflects the whole set. The adapter's own offset arithmetic and `hasMore` calculation — where
an off-by-one actually lives — are now exercised by the same
`expectPaginationContract` the fixture adapter will use. What still cannot be checked this way is
anything Postgres decides: ordering and filtering are asserted as *wiring* (`.order` and `.in` were
called correctly), because faking them here would test the fake.

**A bug the seam surfaced: every proposed action on `/activity` rendered as an empty bullet.**
Typing the read model meant asking what is actually in `proposed_actions`, and the answer was that
**no producer has ever written `description`** — the field the page rendered. Nor does any write
`entity_type` *inside* the blob, so the `(contacts)` suffix beside each bullet never appeared
either. The page has been showing a list of blank list items for as long as it has existed, and
nobody noticed, because a blank `<li>` looks like a tight gap rather than a fault.

Fixed by making the read model describe the conventions the producers share instead of a field they
do not write: `type` (or `kind`, which is what Lex's suggested-rewrite entries use) and `label`
(`description`, else `title`, else `name`). The card falls through them — `Create task: Follow up on
the letter`, or `Suggested rewrite` when the producer records only what kind of action it is, or
`Proposed action` when it records neither. Chosen over enumerating the eight producers' shapes in a
component, which would break every time one changed.

The adapter test now carries all eight shapes copied from their producers, so a producer changing
shape fails there rather than on the page. Two of the eight — `app/actions/champions.ts` and
`pipeline.ts` — store a bare object rather than an array and map to no proposed actions; **flagged,
not fixed**, since changing what a producer writes belongs to that producer's vertical (4.6 and
4.7).

**A trap for every remaining action conversion.** Returning `actionError(err)` from a converted
action breaks its callers. `actionError` returns a *declared* `{ error: string }`, and TypeScript
only adds the `error?: undefined` / `success?: undefined` members that make `if (result.error)`
compile when the returns are fresh object literals. `ApprovalControls.tsx:24` stopped compiling
until the action went back to `return { error: humanizeError(err) }`. Caught by `pnpm typecheck`,
not by the tests.

**Tests moved off the Supabase mock.** `apps/web/test/mocks/repositories.ts` is the replacement — a
bundle of spies. `approvals.test.ts` shrank from describing a query-builder chain to asserting what
the action does, and the SQL it used to restate is now verified once in `@platform/data-supabase`.
`activity/page.test.tsx` is new and follows `crm/companies/page.test.tsx` one layer up. A card test
is new too: `AgentActivityCard` had none, and it is now the read model's only renderer.

**Realtime stays outside the seam**, as planned — but its payloads are raw table rows, so both
subscriptions (`ActivityFeed`, `SimonThread`) map through the adapter's `toAgentActivityItem` rather
than a second hand-rolled conversion that could drift from the server read.

**Verify — what was actually run.** `pnpm typecheck` (13 tasks), `pnpm lint` (8), `pnpm test` (10)
and `pnpm --filter @platform/web build` (46 pages) all green. `@platform/data-supabase` 20 tests,
`apps/web` 64 files / 491 tests. `/activity`, `/simon` and the Fastmail settings page walked
manually.

Note on the phase-end `grep -rl "createClient"` check: it is **not** a useful running metric
mid-phase. It reads 107 now against the 105 recorded in blocking finding 3, because the two files
this vertical removed it from are offset by `lib/repositories.ts` and `providers/RepositoryProvider.tsx`
— which are the provider wiring the check explicitly exempts. It only becomes meaningful at 4.11.

**Kill-criteria checkpoint (4.1).** The estimate this is measured against is the 2–3 days budgeted
for 4.0 plus a vertical the plan calls "smallest, proves the pattern". 4.0 and 4.1 together came in
under that, so the full-seam assumption behind decision 2 is not contradicted here. Two caveats
before reading that as a green light: this was the smallest vertical by design, and the two genuine
surprises — the `agent_activity` fan-out across six call sites, and the contract's read models not
matching the data — are both *pattern* costs that will recur, not one-offs. 4.3 is the checkpoint
that matters, since `campaigns.ts` at 18 `.from(` calls is representative of the heavy verticals in
a way `/activity` is not.

##### 4.2a — News feed: what shipped

**4.2 is four commits, not one.** 12 pages over 8 tables and views is too much to verify in a
single change, and the sub-surfaces are genuinely independent: the feed reads `news_items`, the
detail page adds `reports` and `news_sources`, podcasts add four more tables, collections two more.
Split as **4.2a** the feed (`/news`, `/news/daily`), **4.2b** the detail page and reports,
**4.2c** podcasts, **4.2d** collections and sources. Only 4.2a and 4.2b are demo surfaces.

**Much cleaner than 4.1's fan-out.** `news_items` is read only under `/news/*`, so there was no
boundary-mapping shim to write. Confirmation that the six-way fan-out in 4.1 is a property of
`agent_activity` (which every agent writes to) rather than of every table.

**`@platform/data` now depends on `@platform/shared`, and the import rule in `CLAUDE.md` says so.**
`NewsCategory` and `NewsStatus` are already defined there and used by the agents' ingestion side;
re-declaring them in the read model would have created exactly the drift this platform keeps getting
bitten by. The rule as written said `packages/data` "imports from nothing" — its intent was no
database client and no app code, and `@platform/shared` is a pure leaf that is neither.

**Two things the seam paid for immediately.**

- `select('*')` on 200 rows became eleven named columns. `body_markdown` holds the full text of an
  ingested newsletter, and the feed was pulling 200 of them to render headlines. Nothing forced this
  — asking "what does the read model need?" did.
- **The column list has to be one unbroken literal.** `supabase-js` parses it at the type level to
  type the result, so a concatenated string is just `string` and the result degrades to
  `GenericStringError[]` — which is why the pages this replaces cast their results through
  `unknown`. As a literal, a typo'd column name is a compile error. Worth knowing before the wider
  verticals: several existing pages build column lists by concatenation and cast around the
  consequence.

**A dead prop chain fell out.** `canonicalUrl` was threaded page → feed → card, and the card never
rendered it — it existed only so `promote` could build a knowledge item's `source_url`. With
`promoteItem(id)` reading the row itself, the prop had no consumer, so it left the card, the feed
and the read model. `NewsFeedItem` carries what the feed renders and nothing else; the detail
model in 4.2b will carry `canonicalUrl` because the detail page really does render it.

**`ReadContext.asOf` earns its place here.** "Today's digest" was `dayBoundsInTz(DEFAULT_TIMEZONE)`
against the server clock inside the page. It is now bounded from `ctx.asOf` inside the adapter,
which is what will let a fixture digest stay populated instead of emptying the day after the
fixtures were written — the first vertical where the parameter buys anything. The digest page also
derives its heading from the same anchor, so the date shown and the rows listed can no longer
disagree at a midnight boundary.

**`promoteItem` takes only an id**, and reads the title, url and category from the row. The card
used to build the knowledge item from its own props, so a stale card could file an article under
another's title. It also writes to `knowledge_items` as well as `news_items` — a deliberate
cross-domain write, because "promote this article" is one user action and splitting it across two
repositories would put the ordering and the half-done state on the caller. Revisit when the
knowledge vertical lands.

**First real consumer of the provider.** `NewsCard` writes from the browser, so it reads its bundle
from `useRepositories()` — the two-layer client wrapper from 4.0 doing the job it was built for.

**Found, not fixed: the "Show archived" toggle cannot work.** The feed query excludes archived rows,
so the toggle filters a set that never contains any. It only ever reveals items archived in the
current session; after a reload they are unreachable. Preserving the behaviour exactly was the right
call for a seam change — making the toggle work means deciding whether the feed should fetch
archived rows at all, which is a product decision.

**Verify — what was actually run.** `pnpm typecheck` (13 tasks), `pnpm lint` (8), `pnpm test` (10)
and `pnpm --filter @platform/web build` all green. `@platform/data-supabase` 28 → 46 tests,
`apps/web` 64 → 65 files and 492 → 497 tests. `NewsCard.test.tsx` moved off the Supabase mock: its
three `source_url` cases moved to the adapter, where that choice now lives, and what is left asserts
the card's own behaviour. `/news` and `/news/daily` walked manually.

##### 4.2b — Article detail and reports: what shipped

Converted `/news/[id]`, `NewsItemDetail`, `ReportPanel` and `app/(app)/news/[id]/actions.ts`.

**The page was doing query planning.** It read the item, then decided from that row whether to
resolve a source name, whether to load a report, and whether that report needed its predecessor
looked up — four queries, three of them conditional on the first. `getItem` returns the assembled
model in one call, and the branching lives in the adapter where it can be tested. The page is now
twelve lines.

**`ReportPanel` went camelCase**, all twenty fields. Weighed against leaving a snake_case island in
the read model: the fixture adapter will have to author report fixtures in Phase 6, and a model that
is camelCase everywhere except reports is the kind of seam that gets papered over with a mapper
later. `tsc` catches every rename, so the risk was low and the churn was one file.

**Two fields the panel wanted did not exist in the data.** It read `revision_of_report_id` for one
thing only — whether to show the "the publisher changed this document" notice — and took the
resolved predecessor separately as a prop. The read model names both intentions: `isRevision` for
the notice, `supersededItemId` for the link. They are genuinely independent, because a revision
whose predecessor was never surfaced as a feed item still shows the notice, without a link. Deriving
one from the other would have dropped that case silently, so there is a test for it.

**Storage is not data, and stays on the raw client.** `getReportFileUrl` mints a 60-second signed
URL for a private bucket. That call is now split: *which* artefact a report points at is a
repository read (`getReportFile`), and minting the URL stays on `getAuthedClient()` — for the same
reason auth does. A fixture adapter can answer the first and has nothing to stand in for on the
second. The contract does not mention Storage at all; this is the rule for it.

**The `reports` cast is now in one place.** `reports` is absent from the generated `Database` types
until `generate-types` runs against the migrated database, so `from('reports' as never)` appeared in
the page and twice in the actions file. It appears once in the adapter now, next to the row type it
justifies.

**The fake grew a response queue.** `getItem` can read `reports` twice — the report, then its
predecessor — and a single canned response per table cannot express that. `__queueResponses` gives
successive reads their own answers, with the last entry repeating. The first attempt monkey-patched
`client.from` inside two tests; this replaced it.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 46 → 60 tests. The page test's two source-name cases moved down to
the adapter, where that resolution now happens, and the page test gained one the old shape could not
express: a dropped connection must not render as "not found". `/news/[id]` walked manually, with and
without a report.

##### 4.3a — Content pipeline: what shipped

Converted `/content`, `ContentBoard` and all five actions in `app/actions/content.ts`. `/content/[id]`
and `/content/[id]/copy` are 4.3b; `/campaigns/*` is 4.3c.

**Where the business rules go: the facts are the repository's, the sentences are the app's.**
`scheduleContent` enforces nine preconditions before a post can be queued, each with its own message
to a director. Pushing those into the adapter would put brand-voice copy in the data layer and force
the fixture adapter to reimplement them; leaving the *reads* in the action would mean three queries
in a server action the seam is supposed to have emptied. So the read model is the gate —
`getPublishGate` gathers the item, its account's credential and the platform's character limit in
one call — and the rules stay in the action. This is the shape to reuse wherever a vertical has
guarded writes, and it is the first place the read model is named after a domain concept (the
`publish-gate` principle) rather than after a table.

**The same split, drawn differently for `updateContentBody`.** Its three refusals are copy and stay
in the action, but the compliance reset — an edit to an account- or campaign-linked draft returns it
to pending so the recheck listener re-runs Lex — moved *into* the adapter. That one is an invariant,
not a caller's choice: a cleared verdict must not survive an edit, and a caller that forgot the flag
would break it silently. The adapter re-reads the link fields rather than taking a boolean.

**Two latent problems the read model surfaced.**

- **The board typed statuses as bare strings.** `useOptimistic`'s reducer, `handleDrop` and the
  column keys all took `string`, so a typo'd status would have flowed to the server and been
  rejected there, if at all. Typing them against the read model's `ContentStatus` makes an invalid
  column key a compile error.
- **The publish gate looked up LinkedIn's character limit by hardcoding `'linkedin'`.** It only
  schedules LinkedIn today, so it never mattered — but a gate that always asks for one platform's
  limit silently applies the wrong one the day it schedules another. The adapter keys the spec
  lookup off the item's own type. Covered by a test.

**A deliberate deletion, against the usual rule.** `updateContentStatus` took an
`extras?: { published_url?; published_at? }` parameter. No caller has ever passed it, and
`published_url` was never read even inside the function. `CLAUDE.md` says to flag pre-existing dead
code rather than delete it — the exception here is that keeping it meant carrying a dead option into
a brand-new repository interface, which is worse than removing it. Flagged rather than done
silently.

**`team_members` stays on the raw client** in `/content/page.tsx`, as it does in the app layout. It
belongs to 4.11. A page holding both a bundle and a raw client is the accepted intermediate state,
not an oversight.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 60 → 82 tests; `apps/web` 497 → 509. `content.test.ts` was rewritten
against the repository fake: its two compliance-reset cases moved down to the adapter, and the nine
gate rules are now one parameterised case each, so a rule that stops firing fails on its own line
rather than inside a shared setup. Two cases the old shape could not express were added — a platform
that declares no character limit must not block every post on it, and an already-scheduled post must
still be re-schedulable. `/content` walked manually.

**Kill-criteria checkpoint (4.3).** This is the vertical the checkpoint was set for: `campaigns.ts`
at 18 `.from(` calls, `content.ts` at 8, and the first genuinely rule-heavy actions in the app.
4.3a came in comfortably, and the reason is worth recording, because it is the finding that decides
whether the remaining verticals are cheap or expensive: **the cost is concentrated in guarded
writes, not in reads.** Reads have converted almost mechanically across three verticals now. The
expensive part is deciding, per guarded write, which half of it is an invariant and which half is
copy — and that decision now has a worked pattern rather than being re-derived each time. The
full-seam assumption behind decision 2 holds. 4.3b and 4.3c will test it against 18 more `.from(`
calls, but nothing so far contradicts it.

##### 4.3c — Campaign writes: what shipped

All eight actions in `app/actions/campaigns.ts` — the heaviest action file in the app after
`company.ts`, and the one the 4.3 checkpoint was set against. 18 `.from(` calls across six tables,
now none: 453 lines down to 360. The four campaign pages are 4.3d.

**The principal finally does something.** `savePostMetrics` and `promotePostToSnippet` stamp
`recorded_by` / `created_by` from `auth.user.id`. Those are now taken from the bundle's bound
principal instead, so neither method has a parameter for who is acting — a caller has no way to
record a snippet against someone else. This is the first concrete payoff of the scoping rule settled
before 4.1: it was argued for on read scoping, and it turns out to matter just as much for the
actor stamped on a write.

**Two guards that could not move without breaking.**

- `markVariantPosted` rides its precondition on the update — `.eq('status', 'approved')` on the
  write itself, then counts returned rows — so two submits racing cannot both find the row approved
  and both write. Read-then-write in the repository would have lost that. The method returns a
  boolean and the action supplies the sentence.
- `saveCadenceAndLaunch` writes the launch signal *last*, because a Realtime listener reacts to it
  and must not see a half-built campaign. The ordering is now inside one method rather than four
  statements a caller could reorder. **Pre-existing and not fixed:** there is no transaction, so a
  failed account insert after the wholesale delete leaves the campaign with none. Recorded with a
  test that at least pins the consequence — the launch is not signalled when that happens.

**`editVariantCopy` was the messiest thing in the vertical, and most of it was not the action's
business.** It patched `gate_state.preview` — reaching into a JSONB the workflow owns — counted
codepoints, reset compliance, and replaced thread segments. All of that is now the adapter's, so the
action is validation plus two refusals. The codepoint count went with it: `charCount` matters
because `.length` counts an emoji twice and would overstate a post against the platform limit, and
that is a fact about the data, not about the page.

**A type I invented and had to take back.** `VariantGateDecision` was drafted as a discriminated
union — a `request_change` carries an instruction, an `approve` does not. The Zod schema is flat and
enforces that pairing at runtime, so the union described a payload the database never holds and the
action could not narrow to it. Reverted to the flat shape that is actually written. Worth
remembering: the read model should describe what is stored, not what would be tidy.

**These eight actions had no test at all.** 453 lines of guarded writes, most handing a decision to
the agents server through a JSONB column, with zero coverage. `campaigns.test.ts` is new — 26 cases
over the validation and refusals that stayed in the app, including both halves of the strategy lock
and the stale-queue path. Checked non-vacuous by deleting the strategy-lock guard and watching that
case fail on its own.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 82 → 104 tests; `apps/web` 509 → 535 across 65 → 66 files.

**Kill-criteria checkpoint (4.3), concluded.** The heaviest action file in the demo's half of the
app converted without the approach bending, and the 4.3a finding held up: the cost is in guarded
writes, and it is a thinking cost rather than a typing one. The three questions each guarded write
asks — is this an invariant or is it copy, does the guard have to ride the write, does the ordering
matter to a listener — took the time here, and all three now have worked answers to point at.
**Decision 2 stands; no re-cut.** The remaining unknown is `company.ts` at 21 `.from(` calls in 4.6,
which is larger but, on this evidence, not different in kind.

##### 4.3b — Content detail: what shipped

Converted `/content/[id]`, `/content/[id]/copy`, `ContentEditor`, `DraftFeedback` and
`app/actions/contentFeedback.ts`.

**Another page doing query planning, and a worse one.** `/content/[id]` ran four queries where three
were conditional on what the first returned — a thread has segments, a social draft has prior
feedback, a LinkedIn post has a character limit. `getDetail` assembles all of it, and because the
three conditionals depend on the item and on nothing else, the adapter runs them together rather
than in sequence. `/content/[id]/copy` was the same shape with three more.

**Id-or-slug resolution moved down.** The page called `idColumn(id)` to decide which column to
match. Which column identifies a row is a fact about the data, so `getDetail` takes an identifier
and works it out — a board card links by slug and the social-draft email links by id, and neither
caller needs to know that any more.

**Two `as any` casts deleted, and they were already obsolete.** Both pages and the feedback action
carried `const db = supabase as any` with an `eslint-disable no-explicit-any` and a comment saying
`content_feedback` and `social_account_id` "are not in the generated Database types yet". They are —
every table and column those comments name is in `database.ts` today. The types were regenerated at
some point and nobody went back to remove the escape hatches, so three files had been running
untyped against tables that type fine. Converting them removed the casts as a side effect; worth
noting because a stale `as any` is invisible until something reads it.

**The status flow was bare strings here too**, exactly as on the board — `statusFlow` mapped
`Record<string, { next: string }>`, so `setOptimisticStatus(nextStep.next)` took any string. Typed
against `ContentStatus` now. Two independent instances of the same latent bug in one vertical is
worth remembering when the later verticals get their turn.

**`DraftFeedbackEntry` moved out of the component** and into the read model, which is where the
shape it describes now comes from. `ContentEditor.test.tsx` was rebased onto `fakeContentDetail`
rather than keeping its own literal, so a new field on the read model lands there with a default
instead of breaking five cases.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 104 → 114 tests. `contentFeedback.test.ts` moved off the Supabase
mock; its denormalisation cases — platform and post form copied onto the row, a thread snapshotted
as its joined segments — went down to the adapter, which gained a case the old test did not have:
the 500-character excerpt cap. `/content/[id]` walked manually as a thread, a single post and a
social draft with feedback.

##### 4.3d — Campaign pages: what shipped, and 4.3 closed

The five `/campaigns/*` pages and the seven components behind them. No raw client remains under
`/campaigns`, so vertical 4.3 is complete.

**Worth recording for the plan: only half of 4.3 was ever a demo surface.** The re-picked surface
table lists *Content pipeline — `/content`*. `/campaigns/*` appears nowhere in the demo's seven
surfaces, so 4.3d is background work of the same kind as 4.7–4.11, despite sitting inside a vertical
the table marks "Yes". The vertical table now says so. This matters for the 4.6 kill criterion: if
the client app does not firm up, the question is not only "skip 4.7–4.11" but "which parts of
4.1–4.6 were background too".

**A third page doing query planning, and the most elaborate one.** `/campaigns/[id]` derived
`planLocked` from the status, and only then issued three more queries — beats, matrix, published
posts — because before plan approval the beats live transiently in `gate_state` and no variants
exist. `planLocked` is now a field on the read model: a fact the page reads rather than a rule it
re-derives. The queue page's n+1-shaped segment fetch went the same way, into one `in(...)` query
the adapter owns.

**A distinction the read models had to make explicit.** Three of these fields — `strategy`,
`schedule_plan`, `gate_state` — hold payloads the *strategy workflow* writes and owns. They are not
read models and must not be camel-cased: `PlannedBeat.core_message` is what the workflow stores and
what the gate editor posts back. But `campaign_beats` rows, which the locked canvas renders, are
ordinary table rows and *are* camel-cased. Both appear in `CampaignWorkspace`, one screen apart, and
a blanket rename over that file silently converted the wrong one — caught by `tsc`, but only
because the two types differ. The payload shapes now live in `@platform/data` next to
`VariantGateDecision`, for the same stated reason: **the read model describes what is stored.**

**Duplicate types collapsed.** `PublishedPosts` carried its own `Metrics` interface identical to the
metrics the repository returns; the component now uses `PublishedPostMetrics`. Seven component-local
row types (`OverviewRow`, `CampaignRow`, `BeatRow`, `MatrixRow`, `PublishedItem`, `QueueItem`,
`WizardAccount`) are gone, replaced by read models — which is the point of the seam, and the reason
`apps/demo` can render these components at all.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 114 → 128 tests. `grep -rn "lib/supabase/server" app/(app)/campaigns`
returns nothing. All five campaign pages walked manually, in both the draft and plan-approved states.

##### 4.4a — Market reports: what shipped

`/market-reports`, `/market-reports/[id]`, `ReportFeedback` and
`app/actions/marketReportFeedback.ts`. The indicator and onchain half of `/` is 4.4b.

**This is the surface the demo is built around**, and the read model is shaped to say so.
`MarketReportDetail` keeps `findings` and `narrationMarkdown` as two fields, and the doc comment on
the type states why: `findings` is the payload the narrating agent was handed, `narrationMarkdown`
is what it produced from that and nothing else. Phase 7's `deterministic-before-llm` annotation
attaches to the boundary between them, so the boundary needed to be a boundary in the type rather
than two columns that happen to sit next to each other.

**`findings` is typed as the engine's own `Finding`, snake_case and all.** Same rule as the campaign
workflow's payloads in 4.3d: the findings engine writes that shape into the JSONB, and the read
model describes what is stored. This is the second vertical where the rule earned its keep, and the
first where it lands on the flagship principle — the type the demo annotates is literally the type
the engine produces.

**`report_mode` does not appear in the read model.** The only question anything asks of it is
whether the day was quiet — nothing cleared the materiality floor — so the model exposes
`isQuietDay` and nothing else, as [`repository-contract.md` § Repository interfaces](./repository-contract.md#repository-interfaces)
specifies. `quiet-day-path` is the surface's second principle, and it is now a boolean rather than a
string comparison repeated in two pages.

**A third pair of stale `as any` casts.** Both pages and the feedback action carried
`const db = supabase as any` with "market_reports / market_report_feedback are not in the generated
Database types yet". Both tables are in `database.ts`. That is now three separate places where a
regeneration left the escape hatches behind — content in 4.3b, and these. Worth a sweep of the
remaining `no-explicit-any` disables when 4.6 lands, rather than finding them one vertical at a time.

**The list stopped fetching the findings blob.** It selects six columns for a date, an excerpt and
two chips; `select('*')` was pulling every report's full findings audit trail to render that. Same
class of finding as `/news` pulling 200 `body_markdown`s in 4.2a.

**Deferred, and named so Phase 7 does not discover it late.** The contract's `MarketReportDetail`
also lists `opsFindings` (the staleness set — ops only, never narrated), `lintResult` and
`lexResult`. Nothing renders them today, so they are not in the read model. `opsFindings` in
particular would strengthen the annotation — showing what the engine deliberately withheld from the
narrator — and adding it is one field plus a renderer, not a redesign.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 128 → 142 tests, including a held-day case (the most informative
state on this page: the deterministic step ran, its output is there, and the narration was rejected)
and a malformed-blob case. The page test moved off the Supabase mock and gained one the old shape
could not express — that the quiet-day chip appears only on a quiet day. Both routes walked
manually, published and held.

##### 4.4b — Indicators and onchain: what shipped, and 4.4 closed

The four indicator views on `/`, the two formatting libraries built over them, and the four
dashboard components. Vertical 4.4 is complete.

**The contract's one compliance rule, held by construction.**
[`repository-contract.md` § Repository interfaces](./repository-contract.md#repository-interfaces)
says the indicators repository returns deltas as signed numbers and must not return a direction,
colour or sentiment — an AR must not imply a recommendation, and green-up/red-down is that
implication. The existing code already respected this carefully (`computeDelta` is commented
"direction only, never good/bad"; `signalState` "NEVER mapped to buy/sell or a colour semantic"),
and the seam makes it structural rather than conventional: the read model carries
`changeSincePrior` and stops, and turning a sign into an arrow stays in
`lib/indicators/format.ts`. There is a test asserting the read model has no `direction`, `kind`,
`colour`, `sentiment` or `trend` property, so reintroducing one fails rather than merely reading
oddly in review.

**One method, not four.** The four views are read together, rendered together and useless apart —
a latest row with no series has no sparkline, a series with no latest row has nothing to label it.
`getDashboard` returns the block. It also fails as a block: if any one of the four errors the whole
call throws, because a dashboard silently missing its on-chain half reads as "nothing happened on
chain", which is a different claim from "we could not load it".

**A workaround expired.** `isDailyGranularity` cast its row structurally —
`(row as { period_granularity?: string | null })` — with a comment that the generated view type
lagged the migration adding the column. The read model declares `periodGranularity` outright, so the
cast is gone. Fourth stale-type finding of the phase, and the first that was a workaround rather
than a blanket `as any`.

**`/` is now part-converted, deliberately.** Tasks, projects, contacts and routines belong to
verticals 4.6–4.11 and still read on the raw client alongside the repository call. Same accepted
intermediate state as `/content`'s `team_members` read.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 142 → 149 tests. The two formatting libraries and their tests, plus
`IndicatorCard`, `OnchainCard`, `MacroIndicators`, `OnchainIndicators` and `TrendValuation`, moved
onto the read models — 49 columns across four views. `/` walked manually.

##### 4.5 — Ecosystem signals: what shipped

`/signals` end to end: `EcosystemRepository` with eleven methods, its Supabase adapter over
`v_ecosystem_feed` and `v_ecosystem_watch_health`, `SignalsContent`/`SignalsView` on the read
models, and all nine server actions in `app/actions/ecosystem.ts` converted —
`getAuthedClient` count on that file is now 0.

**The gate this surface exists for.** `compliance-as-alignment` says the compliance step is not a
checkpoint bolted on before publication; it is a property the record has carried since it was
detected. Lex classifies every change at ingest, and for the internal feed that classification is
just a label. It becomes a gate at exactly one point: `flagClientRelevant`, which queues a change
for the client-facing app. So the repository supplies the fact (`getPromotionGate` → the change's
`complianceClass`), the rule lives in `isClientPromotable` in `@platform/shared` so the agents side
judges it identically, and the sentence a director reads stays in the server action. Same
facts-vs-sentences split as the publish and campaign gates.

**It fails closed, and there is a test whose only job is to say so.** A present change with a null
`complianceClass` is *unclassified*, not *safe* — the classifier failing or not having run yet must
never become an accidental promotion to a client. That is a different refusal from "the change is
gone", with different copy, so the repository keeps the two apart: `getPromotionGate` returns null
for a missing change and `{ complianceClass: null }` for an unclassified one, and it throws rather
than returning null on a read error, because a failed read reporting "no such change" would be
answering the promotion question by accident. Un-flagging skips the gate read entirely — withdrawing
a change from clients creates no exposure, and making it fail when the classifier is down would mean
the only way to retract something is for the classifier to be healthy.

**No valence in the read model, again.** `EcosystemChange` carries `changeType` and `severity` and
nothing derived: a release is an event, not good news, and `severity` is the publisher's own word
for it, which is a fact rather than an opinion. Same rule as the indicator deltas in 4.4b, and the
same shape of test — the adapter asserts the read model has no `direction`, `sentiment`, `colour`,
`good` or `risk` property.

**`createWatch` returns the watch it created.** The first cut returned `void` and the existing test
caught it: `EcosystemWatchForm` hands the created row straight to its list, so a void return meant a
new watch vanished until reload. This is the second time in the phase that a narrow grep for
consumers missed one — worth reading the callers rather than grepping the method name.

**A loose type tightened by a typed caller.** `buildWatchConfig` returned `Json`, which admits
`null`, while `NewWatch.config` is `Record<string, unknown>`. Every branch already returned an
object; nothing had ever needed to know that, because the old call site passed it straight into an
untyped insert. Narrowing the signature is the whole fix. That is the seam doing what it is for —
the looseness was invisible until something downstream had a type.

**Read against write, deliberately unguarded.** `setClientRelevant` does not read the classification
itself. Putting the gate in the repository would hide a refusal as a silent no-op and would put a
compliance sentence in a package that has no brand voice; the adapter test asserts the write issues
exactly one query, so a future "helpful" guard there goes red.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 149 → 169 tests; `apps/web` 537. The action test moved off the
Supabase mock onto the repository fake and gained the three gate cases that matter (neutral
promotes, sensitive refuses, unclassified refuses). One test-only bug found on the way: the form
helper treated "field submitted empty" and "field never rendered" as the same thing, and zod gives
them different messages — a browser always submits a blank `label`, so the helper now says which it
means. `/signals` builds and its route compiles; **not** walked against live data from this
session — the feed, acknowledge, curator note, client-relevant toggle and watch register are the
five paths to click when someone next has the app up.

##### 4.6a — Companies: what shipped, and the critical path ends here

`CompanyRepository` (seven methods), its Supabase adapter, `/crm/companies` and
`/crm/companies/[id]`, `CompaniesList` + `CompanyForm` on the read models, all three actions in
`app/actions/companies.ts`, and `getCompanyOptions` in `lib/referenceData.ts` with its ten call
sites. **This is the last demo surface.** Phase 5 is unblocked.

**4.6 is four sub-verticals, and only the first is on the critical path.** The vertical table read
"CRM and company — `/crm/*` (11 pages), `/company` — Yes (companies only)", which bundles a small
critical-path surface with a large background one and puts the phase's kill criterion at the seam
between them. [`demo-app-spec.md` § Routes](./demo-app-spec.md#routes) is unambiguous: the demo's
CRM surface is `/crm/companies`, a glance view, and nothing else under `/crm` or `/company` appears
in it. So the split is **4.6a** companies (this commit), **4.6b** contacts and interactions,
**4.6c** company records/domains/subscriptions (`/company` — `app/actions/company.ts` and its 21
`.from(` calls, the file the plan has flagged as the phase's largest since Phase 0), **4.6d**
champions, personas, segments, interviews and community. Same shape as the 4.2 and 4.3 splits, and
the same finding for the third time: **the vertical table's demo column is per-route, and the
verticals are per-domain, so a vertical marked "Yes" can be mostly background.** Measured across the
three: 4.2 was 2 demo sub-verticals of 4, 4.3 was 1 of 2, 4.6 is 1 of 4.

**Addressing is the adapter's business.** Every CRM detail route accepts either a UUID or a slug,
resolved by `idColumn()` in `lib/utils.ts` — the page picks the column. That does not survive the
seam: a fixture adapter would have to reproduce the app's choice from outside it, and a page that
knows which column addresses a row knows how rows are stored. `getCompany(ctx, idOrSlug)` takes the
route param as given and the adapter decides, with a test for each form — getting it wrong turns an
existing company into a 404. `lib/utils.ts` keeps its copy for the routes 4.6b–d have not reached;
they converge when those land.

**`getCompanyOptions` moved rather than being left behind.** It is the `companies` picklist ten
pages share, and leaving it on the raw client would have meant one table read through two doors —
the split-brain the 4.1 fan-out note warned about. It now takes no client at all (`getPrincipal` is
`cache()`d, so the bundle it builds costs no extra auth round trip), which leaves `referenceData.ts`
holding two differently-shaped helpers until `team_members` converts. Both still compose inside the
`Promise.all` their callers already had, which is why that is tolerable and not a papered-over mess.

**A test that passed when it should have failed.** `crm/companies/page.test.tsx` mocks
`@/lib/supabase/server` and asserts `.order('name')` and `.limit(25)` on the fake — and it still
passed unchanged after the page moved to the repository, because the fake client flowed through
`getRepositories` into the adapter, which issues the same query. Reassuring about the conversion and
useless as a guard: the test was asserting SQL through two layers it no longer names. Rewritten onto
the repository fake, where it asserts the read and the prop hand-off, plus one case the old shape
could not express — that the list gets the repository's *total* rather than the length of the page
it received. The detail page is new and gets its own test, including the resolved-id case: contacts
are looked up by `company.id`, never by the route param, because passing a slug to a UUID foreign
key returns nothing and renders as a company with no contacts.

**Pre-existing, not fixed.** `CompaniesList` takes `totalCount` and immediately discards it
(`totalCount: _totalCount`), passing `companies.length` to its own pagination while `onPageChange`
is a no-op — the list is capped at 25 with no way to reach page 2. That is a paging bug, not a seam
bug, and the repository now returns a real `total` and `hasMore` for whoever fixes it.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the web build all
green. `@platform/data-supabase` 169 → 186 tests; `apps/web` 537 → 547 across 67 files. Not walked
against live data from this session; the paths to click are the list, the create and edit modals,
a row click through to the detail page by slug, and the same page by UUID.

**Verify per vertical:** contract suite green for that domain; its tests rewritten and passing; the
vertical's pages walked manually. Commit before the next.

**Verify at end of phase:** `grep -rl "createClient" apps/web/` returns only `middleware.ts`, the
auth gate, and the provider wiring.

**`apps/web` must be verified working and committed before `apps/demo` exists.**

### Phase 5 — `apps/demo` and `@platform/data-fixtures` (3 days)

Scaffolding and plumbing only. The fixture *content* is Phase 6 — separating them is deliberate, see
below.

- Scaffold `apps/demo` (Next.js App Router). No `@supabase/*`, no `@mastra/*`, no AI SDK in its
  `package.json`, enforced by it simply not depending on `@platform/data-supabase`.
  `@platform/shared` is safe to import — verified as a pure leaf with zero runtime dependencies.
- `packages/data-fixtures` implementing **only the seven demo domains** (verticals 4.1–4.6), mounted
  as a partial bundle per decision 2. Static typed objects, no runtime fetch, no filesystem reads.
  Writes throw `DemoWriteBlockedError(operation, table)`.
- `useRealtimeSubscription` no-ops in the demo — a silent no-op is more honest than a fake event
  stream.
- Demo chrome: disclosure banner, `Demo data` chip, write-blocked toast naming the real table.
- Enough placeholder fixture rows to prove the wiring. Not the real set.

**Verify:** `pnpm --filter @platform/demo build && start` with the network interface down. Contract
suite green against both adapters. `grep -r "mode" apps/demo/` shows `mode` driving only chrome.

#### What shipped

All three parts, as **5a** the splittable bundle, **5b** `@platform/data-fixtures`, **5c**
`apps/demo`. The demo builds, serves all seven routes, and renders dates relative to the day it is
opened.

**5a — the bundle was not splittable, and nothing had noticed.** Decision 2 says `apps/demo`
composes "a partial one typed to the slice its routes actually use", but `RepositoryBundle` was a
total interface with eight required domains: a fixture adapter implementing seven could not satisfy
the type. The symptom had been visible since 4.1 and read as a test quirk — the provider test needed
`{ mode: 'demo' } as RepositoryBundle` to compile. `Bundle<K>` now picks a slice, `RepositoryBundle`
is the full one, `DemoBundle` is the demo's seven, and `campaigns` is absent from the demo slice
rather than stubbed. `useRepositories` takes its slice as a type argument with no default, so a
client component names its data dependencies in its own source and a component shared between the
two apps states what both bundles must carry. **This is the finding that justified doing Phase 5
before the rest of Phase 4:** the gap was one domain wide at 4.6a and would have been seven wide
after 4.7–4.11, and every one of those domains would have been written against an interface shape
that had to change.

**The contract harness had the same defect.** `AdapterUnderTest.createBundle()` returned
`RepositoryBundle`, so the fixture adapter could not run the suite it exists to pass. Now generic
over the slice.

**5b — `asOf` had never been exercised, and it was wrong on first use.** `ReadContext` carries
`asOf` for exactly one reason: fixture adapters date relative to an anchor. Phase 5 is the first
thing to use it, and the first run of the contract suite failed — no fixture was dated *today*, so
`listTodayDigest`, which bands by the calendar day of `asOf`, returned nothing. The demo's research
digest would have been permanently empty. The fix is a `todayAt()` helper that cannot drift out of
the anchor's own day, plus a test that reads the digest at two arbitrary anchors years apart. Worth
noting what kind of bug this is: not a crash, not a wrong number — a surface that renders correctly
and is empty, which is the failure mode a screenshot test also misses.

**5c — static prerendering silently freezes the anchor.** Next prerendered all seven routes as
static, which evaluates `new Date()` once at build time and bakes it into HTML. A demo built in
August would still be calling August "today" in December, and the digest would be empty again for
the same reason. `export const dynamic = 'force-dynamic'` in the demo's layout, with the reasoning
in a comment, because the failure is silent — the pages render, they are just quietly wrong. The
cost is nil: there is no database to hit.

**The demo cannot reach a database, and that is asserted rather than observed.** It depends on
`@platform/data`, `@platform/data-fixtures`, `@platform/shared` and `@platform/ui`, and nothing
else. `apps/demo/lib/boundary.test.ts` walks the whole runtime dependency closure and fails on any
Supabase package, `@platform/db`, or `@platform/data-supabase` — transitively, so adding a client to
`@platform/ui` would go red without the demo's own manifest changing. The absence *is* the security
model, and an absence is exactly the kind of property that disappears in one `pnpm add` without
anything failing.

**`mode` is read in exactly one place.** `DemoChip` takes its label from the bundle's mode rather
than hardcoding "Demo data" — the sanctioned use, and it means a surface mounted against a live
bundle would stop claiming to be a demo instead of mislabelling real data as invented.

**Fixtures are placeholders and say so.** Every string is marked as one. The curated set, the staged
narrative and the Lex pass are Phase 6 — separating them was the plan's call and it held up: Phase 5
touched the wiring in seven places and none of those edits would have been safe to make against
prose someone had already reviewed.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and both app builds
green. `@platform/data-fixtures` 27 tests, `apps/demo` 3, `@platform/data` 16 → 21. The built demo
was served and all seven routes returned 200 with the disclosure banner and the demo chip present on
each; `/market-reports` rendered dates one, two and three days before the day it was served, which
is relative dating working end to end. Not run: the network-down check the plan asks for — the
dependency-closure test is the stronger version of that claim, but it is not the same claim, and a
human should still pull the interface once.

### Phase 6 — Fixture authoring (2–3 days, plus a Lex pass)

**Its own phase because it is writing, not data entry**, and because burying it inside Phase 5
guarantees it gets done in a last afternoon.
[`fixture-and-trace-schema.md` § Narrative staging](./fixture-and-trace-schema.md#narrative-staging) names the failure mode exactly:
"a plausible-but-flat dataset is the most common way a portfolio demo fails — everything works and
nothing is interesting."

~~The existing staging table is void and must be re-derived.~~ **Stale — it was re-derived in
Phase 0.** The table at
[`fixture-and-trace-schema.md` § Narrative staging](./fixture-and-trace-schema.md#narrative-staging)
says so in its own first line, and all 17 rows are against the re-picked surfaces. The design
questions this paragraph raised — what market report makes the quiet-day path legible in five
seconds, what news item makes curator notes land without explanation — are answered there.

Roughly 60–100 rows across ten fixture files, plus transcript segments, plus a trace bundle that has
to agree with all of it.

Per-row obligations, none of which parallelise:

- Every company and person name invented **and ASIC-searched** to confirm it does not resolve to a
  real business ([`fixture-and-trace-schema.md` § Fictional entity rules](./fixture-and-trace-schema.md#fictional-entity-rules))
- Research items: invented titles and paraphrased one-liners only. Reproducing publisher content is
  a copyright problem as well as a compliance one
- No bitcoin allocation figure anywhere — [`demo-app-spec.md` § Compliance considerations](./demo-app-spec.md#compliance-considerations) calls this
  the single highest-risk element of the build
- Internal consistency across the whole set. A trace naming different fictional entities than the
  lists "reads as sloppy and undermines the impression the demo exists to create"
  ([`fixture-and-trace-schema.md` § Redaction](./fixture-and-trace-schema.md#redaction))
- Every date an offset from the anchor, never a literal

#### What shipped

The set is authored: ~40 rows across seven fixture files plus a cast module, replacing the Phase 5
placeholders. Every staging row the current read models can express is implemented, and the rules
the set is written under are now tests rather than prose someone has to have read.

**The staging table was not void.** This section said it was, and that every row had to be
re-derived. It had already been re-derived in Phase 0 — the table in
[`fixture-and-trace-schema.md` § Narrative staging](./fixture-and-trace-schema.md#narrative-staging)
says so in its own first line, and its 17 rows are all against the re-picked surfaces. The stale
claim mattered: it reads as a blocking design task owned by a director, and it was already done.

**Six of the 17 rows cannot be built yet, and none of them are blocked on writing.** They need
fields no read model carries: `opsFindings` on a market report (deferred in 4.4a with a named Phase 7
consequence), the three-dimension `rubric` on a research item, `complianceStatus` on a `ContentCard`
rather than only on `PublishGate`, a last-interaction date on `CompanySummary`, and podcast items
with transcript segments (vertical 4.2c, background). Each is a small widening of one read model, but
widening a read model to feed a demo is the tail wagging the dog — the right sequence is to widen it
when a surface in `apps/web` needs it. Recorded here so Phase 7 does not annotate a claim the data
cannot support:

| Staging row | Needs | Where it belongs |
|---|---|---|
| Market report with ops findings | `opsFindings` on `MarketReportDetail` | 4.4a follow-up |
| Research item with full rubric | `rubric` on `NewsItemDetail` | 4.2 follow-up |
| Podcast item with segments | The podcast domain | 4.2c |
| Content item, Lex flagged *(half)* | `complianceStatus` on `ContentCard` | 4.3 follow-up |
| Stalled CRM company *(half)* | `lastInteractionAt` on `CompanySummary` | 4.6b |

The two half-rows do render: the flagged draft shows as `review` on the board and reveals the
verdict when the publish gate is asked, and the stalled company reads as stalled from its note. What
is missing in both cases is the machine-readable field, not the story.

**The compliance rules are now executable.** `content.test.ts` walks every string the set puts on a
screen and asserts: no bitcoin allocation figure, percentage or amount anywhere; none of
`brand-voice.md`'s banned terminology; no exclamation marks; no emoji; every email on `example.com`;
every link on an example domain; every entity name sourced from `entities.ts`; and no absolute date
in any prose. It also asserts the staging claims themselves — that the quiet day scored a finding and
still said nothing, that a finding exists whose `verdict_allowed` is false *and* that the narration
visibly respects it, that a change is unclassified so the promotion gate's fail-closed path has a
row, that indicator deltas carry both signs and a zero. Those last ones matter because the most
common way this set degrades is not a compliance breach; it is someone editing a fixture into
blandness and nothing noticing.

**One rule that is easy to get backwards, now enforced.** The entity rules are about invented names
not resolving to real businesses. The larger risk is the inverse: an invented headline attributed to
a *real* regulator or publisher is a fabricated record of an institution that exists, which is worse
than a name collision. So research sources are invented mastheads, items concerning a regulator say
"a regulator", and a test fails on any real institution appearing anywhere in the prose.

**The set found two bugs the placeholders had hidden.** The fixture adapter did not exclude archived
items from the research feed, which the interface requires and the live adapter does with
`.neq('status', 'archived')` — invisible until a fixture set contained an archived row. And the
demo's market-reports page labelled every report `isQuietDay ? 'Quiet day' : 'Findings cleared the
floor'`, so a held report and a failed run both claimed findings had cleared — on the one surface
whose entire claim is that the system tells those apart. Both fixed, both with a regression test.

**⚠️ Two verification gates are NOT met, and this must not deploy until they are.**

1. **The ASIC search has not been done.** Every company name in `entities.ts` was chosen to be
   implausible as a real business, which is not the same as verified. No test can substitute — the
   check is a search against a register. `entities.ts` carries the warning at the top of the file.
2. **The Lex pass has not been run.** The spec requires a classification pass over the full set with
   the outcome recorded in `agent_activity` on the live platform, and that needs the agents server
   against the real database. The market report narration is the highest-risk prose in the set and
   is exactly what the pass is for; a `flagged` verdict on any of it is a signal to rewrite rather
   than override. The one deliberately non-compliant string in the set — the flagged content draft,
   written to fail so the gate has something real to point at — will and should trip it.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and both app builds
green. `@platform/data-fixtures` 27 → 55 tests. The built demo was served and all seven routes
returned 200; `/market-reports` rendered all four pipeline states with distinct labels, `/news`
showed the curator note, the rejected item and the email-sourced item, and `/signals` showed the
neutral, refused and unclassified changes.

**Ownership.** The typing is delegable; the narrative decisions are not — but they were made in
Phase 0, in the staging table, which is what left this phase delegable after all. Deciding which fixtures
make the architecture visible needs domain judgment and carries the compliance risk. Charlie can
draft prose against brand voice, but [`demo-app-spec.md` § Open questions](./demo-app-spec.md#open-questions) already flags
the register problem — a company voice describing an individual's work reads oddly. Chris sets the
staging table; an agent fills it in afterwards.

**Verify:** Lex classification pass over the full set, outcome logged to `agent_activity`
([`demo-app-spec.md` § Compliance considerations](./demo-app-spec.md#compliance-considerations)). ASIC search recorded for every invented entity.

### Phase 7 — Annotation layer (2–3 days)

- Overlay per [`demo-app-spec.md` § Annotation layer](./demo-app-spec.md#annotation-layer): `data-annotation-id` targets,
  absolute positioning against a relative container, keyboard-navigable markers, Product view
  default.
- ~~Seven annotations (the eight required minus the contracts one).~~ **Stale.** The required table
  has eight live rows and no contracts row. Seven ship here; the eighth targets `/agents/run/[id]`
  and ships with Phase 8. Plus `/architecture` prose.

**Verify:** toggle on every demo route with no layout shift. Tab to every marker. `jsx-a11y` clean.
Read all seven cold and check the architecture is describable from them alone.

#### What shipped

The overlay, seven annotations, `/architecture`, and the two detail routes two of the annotations
needed in order to have anything to point at.

**"Seven annotations (the eight required minus the contracts one)" was stale in both halves.** The
required table in
[`demo-app-spec.md` § Required annotations](./demo-app-spec.md#required-annotations) was rewritten in
Phase 0 and has eight live rows, none of them contracts. Seven is still the right number here, for a
different reason: one row targets the trace replay at `/agents/run/[id]`, which is Phase 8. It ships
with that route rather than pointing at nothing now. All seven principles are still covered —
`deterministic-before-llm` carries two of the eight rows — and `/architecture` documents
`hub-and-spoke` regardless, because someone reading the written notes should get the whole design
rather than the part that happens to have a marker.

**"No layout shift" is held by the layer not existing.** In Product view the overlay returns `null`
— not a hidden element, nothing at all. In Architecture view it is `position: fixed` with
`pointer-events: none`, and outlines are drawn *over* targets rather than applied as borders *to*
them, which would shift everything after each target by two pixels. Targets are measured with
`getBoundingClientRect` and re-measured on scroll and resize. The requirement is structural rather
than something to check by eye after each change.

**Markers are real buttons in DOM order**, so keyboard navigation needs no key handling of our own;
the only key the overlay listens for is Escape. The visible label is a digit, which says nothing, so
the accessible name carries the title. There is a test for tab order specifically, because absolute
positioning makes it easy to reorder markers visually and forget that tab order follows the DOM.

**A silent failure mode, now caught.** The overlay resolves targets with `document.querySelector`,
so a renamed or misspelled `data-annotation-id` produces no marker and no error — the demo would
quietly have fewer annotations than it claims. `annotations.test.ts` reads every `.tsx` under `app/`
and fails if a selector appears in no source, and separately checks that each annotation's route has
a `page.tsx` and that its principle has a section on `/architecture` to link to.

**Two targets were duplicated and worked by accident.** `indicator-delta` rendered seven times and
`relevance-score` five, once per row of a list; `querySelector` takes the first, so the marker landed
on row one incidentally rather than by decision. Both now render on the first row only, with the
reason in a comment.

**Two routes were added because annotations needed them.** `/market-reports/[id]` hosts the
findings/narration boundary — the annotated element is the *heading* of the findings block, because
the claim is about what sits either side of it — and `/news/[id]` hosts the curator note. The report
detail page also states each finding's `verdict_allowed` outright rather than leaving it to be
inferred from the prose, so a reader can check the narration against it.

**The content board now shows its compliance verdict.** It reads `getPublishGate` per card, since
the verdict lives on the gate rather than on the card. Only the flagged one is annotated: a cleared
verdict demonstrates nothing a reader would not assume, and the point of the surface is that the gate
can say no.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and both builds green;
`jsx-a11y` reports nothing in `apps/demo` (the remaining warnings are pre-existing in `apps/web`).
`apps/demo` 3 → 31 tests, including the overlay's keyboard and panel behaviour in jsdom — the demo
gained a node/jsdom project split for it, same shape as `apps/web`. The built demo was served: all
ten routes returned 200, both not-found paths returned 404, every annotation target resolved exactly
once on its route, and all seven `/architecture` anchors are present. Not done: reading the seven
cold to check the architecture is describable from them alone — that is a judgement about someone
else's comprehension and wants a second reader.

### Phase 8 — Trace recorder and replay (4–5 days)

- `pnpm install` first, then read `node_modules/@mastra/core/dist/docs/` for the 1.54.0 surface.
- Recorder: a second `SpanOutputProcessor` registered next to `AgentActivitySpanProcessor` in
  `apps/agents/src/mastra/index.ts:103-120`, behind an env flag, off by default. Translate spans
  into the BTS-owned `TraceBundle`. **Do not copy the `VALID_AGENT_NAMES` filter** from
  `agentActivityProcessor.ts:19` — it would drop `lex` spans, and the Lex gate is part of what this
  trace is for.
- **Record against a seeded synthetic campaign, not production data.** The recorder is new code and
  redaction is its first live exercise; recording a real run means real client data passes through
  it before redaction. Seeding a synthetic campaign costs an hour and means real data is never in
  scope at all. Redaction stays in the pipeline regardless — belt and braces, per
  [`fixture-and-trace-schema.md` § Redaction](./fixture-and-trace-schema.md#redaction).
- Record one `variant` run end to end (`apps/agents/src/workflows/variant/index.ts`): the
  `variant.generate_copy` step, the `variant.compliance_check` step invoking Lex, then the `gate3`
  suspend at lines 327-388, resumed by `startVariantGateWebListener` off
  `content_items.pending_decision` (`workflows/variant/run.ts:50-60`), through to the
  `agent_activity` write at lines 116 and 126.
- Render Lex's verdict as a first-class trace step, not a tool call. `agents/compliance/index.ts:121`
  (`verdictToActivity`) writes `status: 'pending'` on a fail and `'auto'` on a pass, with a
  `suggested_rewrite` proposed action; that branch is worth showing.
- `packages/agent-traces` for the schema and recorded JSON, imported statically.
- Replayer in `apps/demo` at `/agents/run/[traceId]`, driving the same components, with the
  transport controls and compression function from
  [`fixture-and-trace-schema.md` § Timing compression](./fixture-and-trace-schema.md#timing-compression).

**Verify:** replay with the network down. Step back across the gate boundary. Confirm no API key in
the demo's Vercel env. Confirm the recorder is disabled by default in `apps/agents`.

#### What shipped, and the half that could not

`packages/agent-traces` (schema, timing, one bundle), the recorder in `apps/agents`, the replayer at
`/agents/run/[traceId]`, and the four annotations the route finally made possible — including
`hub-and-spoke`, the last principle without a target.

**⚠️ The bundle is authored, not recorded.** Recording a real run needs the agents server, a
database and live model credentials, none of which are reachable from a build session. The bundle
was written against the workflow source instead — real step ids (`resolve_context`, `generate_copy`,
`compliance_check`, `persist`, `gate3`), real payload shapes (`charlieVariantSchema`,
`lexVerdictSchema`), the real `agent_activity` writes (`variant_generated`, `compliance_checked`).

Rather than leave that implicit, the schema carries a `provenance: 'recorded' | 'authored'` field and
the replay states which on screen. The reasoning is the same one this project applied to fixtures:
the entire value of a trace over a mockup is that it is a real run, and a bundle that let a reader
assume it was recorded would take that value dishonestly. **Running the recorder against a seeded
synthetic campaign and replacing the bundle is outstanding work**, and the file says so at the top.

That field caught a bug immediately. The sidebar reported zero redactions as "recorded against a
synthetic campaign, so no client data was in scope" — a true and useful sentence about a recorded
run, and a false one here. Zero redactions means two different things depending on provenance, and
the copy now distinguishes them.

**The recorder is off unless a trace id names the run to capture.** `TraceRecorderProcessor.fromEnv()`
returns `null` rather than a no-op processor, so the disabled case is visible at the registration
site in `mastra/index.ts` — a reader can see whether the list has one processor or two. There is no
"record everything" mode: a recorder that is on by default eventually records something it should
not. It writes on `shutdown` rather than needing a caller to remember to flush.

**It does not copy `VALID_AGENT_NAMES`**, as the plan warned. That filter silently drops spans whose
agent is not in its list, `lex` included, and would have produced a trace that looked complete while
missing the compliance verdict — the step the trace mostly exists for.

**Redaction runs on the way in.** `redact()` recurses into nested objects and arrays, because the
payloads crossing between workflow steps are nested and a top-level pass would miss every
interesting case while looking like it worked. It records what it removed and from which step. A
cleanup pass was never an option: it means real data exists in a file on disk at some point, and
files on disk get committed.

**The schema imports nothing, and a test enforces it.** Not `@mastra/core`, not anything — the
package has no `dependencies` key at all. A public demo that breaks on an unrelated framework upgrade
fails silently at the moment someone is looking at it, so the recorder translates and the bundle
survives. The test scans the package's own sources, excluding its test file, which named the
forbidden import in its own regex and matched itself on the first run.

**Position is a step index, not a timer offset.** Every control moves the index and the timer only
advances it, so stepping back across the gate boundary is the same operation as stepping forward and
there is no separate seek path that can disagree with playback. That is the phase's named verify
item and it has a test.

**A tension in the spec, surfaced rather than papered over.** The compression rules cap a gap at
1200ms, and the target total replay is ~45 seconds — but 12 steps × 1200ms is 14.4s, so a
twelve-step trace cannot reach the target however it is timed. This one replays in about 7 seconds.
Padding the offsets to fill the budget would be inventing latencies, so the timings stand and the UI
says what playback is for: "Play gives you the shape of the run in a few seconds. Step through it to
read what actually crossed between the steps." A recorded run with more steps will land closer to
the target on its own.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and both builds green.
`@platform/agent-traces` 18 tests, `apps/demo` 31 → 44, `apps/agents` 1226 → 1236. The route serves,
an unknown trace id 404s, and all four trace annotation targets resolve exactly once. **Not done:**
recording a real run (see above); the network-down replay (the package has no runtime fetch and the
demo has no network dependency in its graph, which is the structural version of that claim but not
the same test); and confirming the demo's Vercel env has no API key, which needs the Vercel
project.

### Phase 9 — Demo E2E (1 day)

- Extend the Phase 1 Playwright suite to `apps/demo`: snapshot the seven surfaces, walk the
  annotation toggle, walk the trace replay transport. No auth, no backend, no stubs — the fixture
  adapter makes this the easy case.
- Promote the demo specs from advisory to blocking once baselines have settled. The demo is a public
  artefact; a silent visual break there is worse than a red build.

#### What shipped

Three specs — `demo-surfaces`, `demo-annotations`, `demo-trace` — wired into `e2e.yml`, plus a
`webServer` in the Playwright config. **33 behavioural assertions pass; the 9 screenshot specs are
awaiting their baseline bootstrap.**

**The easy case the seam was built to produce.** No auth fixture, no request interception, no
Supabase stub: `goto` and assert. `e2e/fixtures/auth.ts` and `e2e/fixtures/supabase.ts` — the two
hardest files in the original E2E proposal — are still never written.

**What needed a browser, and what did not.** The jsdom component tests cover the overlay's state
machine, but jsdom has no layout engine: every `getBoundingClientRect` there returns zero, so a
marker positioned by measurement is untested until something lays the page out. Likewise "does Play
actually advance on its own" is a question about a real event loop. So the browser specs assert
exactly the claims jsdom cannot: markers land on their targets, turning the layer on moves nothing
underneath it (measured — every target's rect before and after, and the page's scroll height), and
playback advances and pauses on a real timer.

**Baselines would have diffed daily.** Every fixture date is an offset from today, so
`/market-reports` renders different text on every run. A suite that fails every morning is one
everyone learns to ignore, which is worse than not having it. Volatile text now carries
`data-volatile` in the demo's markup and is masked in screenshots — one attribute, one route, and
the mask is a fixed-size block over an ISO date so layout is still covered. The trace replay is
deliberately *not* masked: its `recordedAt` is a real fixed instant, the one exception to relative
dating, so it renders identically every run.

**The Google Fonts link was costing far more than it looked.** The layout copied `apps/web`'s CDN
stylesheet, and a stylesheet in `<head>` gates `DOMContentLoaded` — so every navigation in this
environment took about twelve seconds, and the nine-route walk timed out. Writing the exception into
the no-external-requests test (`except fonts`) is what made it obvious the request should not exist
at all. The demo now self-hosts its faces through `next/font`, and the numbers moved accordingly:
**the chrome suite went from 1.4 minutes to 7 seconds**, and the test has no exception list.

That is not a test-only win. "Works with the network down" is the claim this app is built around,
and a page whose `DOMContentLoaded` waited on fonts.googleapis.com was slow to become interactive
offline rather than merely unstyled. The trade is that the demo now needs network at *build* time to
fetch the faces, and none at *run* time — the right way round for a public artefact. `apps/web`
keeps the CDN link deliberately: it is internal and authed, and nobody is evaluating whether it
works offline.

**⚠️ Screenshot baselines are not committed.** They must be generated inside
`mcr.microsoft.com/playwright:v1.62.1-noble` — font hinting differs enough elsewhere that baselines
from another machine diff on every CI run — and no Docker daemon was reachable from this session.
Bootstrap them with the workflow's `workflow_dispatch: update_baselines` input, or
`pnpm test:visual:update` on a machine with Docker, then commit `e2e/**-snapshots/`.

Until then the screenshot cases **skip**, guarded on the snapshot directory's existence. The first
CI run failed nine of them on `A snapshot doesn't exist`, each retried twice by a `retries: 2` that
could not possibly help — noise standing in front of the steps that do carry signal, and a
permanently red advisory workflow is the thing that teaches everyone to ignore it. That is the same
argument as the one against baselines that diff daily.

The guard is the whole directory, not the individual file, so once baselines exist a *missing* one
fails loudly again — at that point it means someone added a route without regenerating. Verified
non-vacuous by creating the directory and watching the case run and fail properly.

**Not promoted to blocking**, per the plan's own condition: baselines have not settled because they
do not exist yet. The behavioural specs are the ones worth promoting first — they need no baselines
and cannot flake on antialiasing.

**Verify — what was actually run.** `pnpm typecheck`, `pnpm lint`, `pnpm test` green;
`apps/demo` builds. 33 of 42 Playwright specs pass against the built demo, the 9 failures all being
`A snapshot doesn't exist`. The demo makes zero requests off its own origin, asserted rather than
assumed.

### Fixture drift policy

Not a philosophical question — a weekly operational one. Measured: **25 migrations in the three
weeks to 2026-08-03**, many hitting demo-surface tables directly (`add_content_feedback`,
`add_market_report_feedback`, `add_news_item_image`, `add_podcast_collections`,
`add_findings_engine`, `add_ecosystem_signals`). CI runs `pnpm typecheck` workspace-wide, so a
migration PR touching a demo surface will go red on fixture compile roughly every week.

**Policy:** start in the shared gate, per [`demo-app-spec.md` § Open questions](./demo-app-spec.md#open-questions). The compile
failure is the drift alarm and it is doing its job. Fixture updates are expected to be one-line
additions; keep the fixture set narrow so they stay that way.

**Escape hatch, defined in advance so it is not litigated mid-PR:** if fixing fixtures blocks an
unrelated PR by more than ~15 minutes on three separate occasions, move `@platform/demo` and
`@platform/data-fixtures` typecheck out of the PR gate into the nightly `e2e.yml` workflow. Drift is
then caught within a day instead of instantly, which is the right trade once the alarm has proven
noisy. Do **not** reach for `Partial<>` fixture types
([`assumptions.md` § Accepted risks](./assumptions.md#accepted-risks)) — that trades the alarm away permanently for a
convenience that a nightly job provides without loss.

### Deferred deliberately

- The gated live-inference path ([`demo-app-spec.md` § Gated live path](./demo-app-spec.md#gated-live-path-optional-ship-last)). Ship only if
  everything above is stable.
- The sidebar responsive collapse ([`assumptions.md` § Explicitly deferred](./assumptions.md#explicitly-deferred)). A real gap —
  recruiters do open links on phones — but it is `apps/web` work that should be justified on its own
  merits, not smuggled in.
- Playwright journey tests, Option B local-Supabase, and cross-browser coverage from
  [`apps/web/docs/e2e-playwright-proposal.md`](../../../apps/web/docs/e2e-playwright-proposal.md).
  Phase 1 takes the visual-regression subset only.

---

## End-to-end verification

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` green at root — the PR gate in
   `.github/workflows/test.yml`.
2. `e2e.yml` visual suite green with zero unexplained diffs.
3. Contract suite in `packages/data` passes against both adapters.
4. `apps/web` walked manually across all refactored pages — types do not catch query-shape bugs.
5. `apps/demo` builds and runs with the network disabled.
6. `grep -r "@supabase\|@mastra" apps/demo/package.json` returns nothing.
7. A token change in `packages/ui/src/tokens.css` appears in both apps **and** the design skill with
   no further edits.
8. Fixture set reviewed against Lex's classification rules, outcome logged to `agent_activity`.
9. `demo.btreasury.com.au` serves `noindex`; no secrets in the demo's Vercel env.
10. Someone with no context reads the demo cold and can describe "deterministic before LLM".

## Risk register

| Risk | Mitigation |
|---|---|
| Phase 4 regresses working `apps/web` pages | One vertical at a time, each walked manually and committed before the next; contract suite plus per-vertical RSC tests; app shippable at every commit |
| Phase 4 stalls half-migrated | Critical path stops at 4.6, so Phase 5 unblocks even if 4.7–4.11 slip; kill criteria at 4.1 and 4.3 |
| Seam ROI depends on a client app that may not happen | Kill criterion at 4.6 — if the client app has not firmed up, stop after the demo surfaces and skip 4.7–4.11 entirely |
| ~40 tests rewritten from Supabase mocks to repository fakes | Budgeted per vertical rather than discovered late; the repository fake is a far smaller surface than `test/mocks/supabase.ts` |
| Token or component extraction changes rendering silently | Phase 1 baselines captured **before** any extraction; zero-diff is the pass condition for Phases 2 and 3 |
| Fixture drift blocks unrelated PRs weekly | Stated policy above, with a pre-agreed escape hatch to a nightly job |
| Flat fixtures make a working demo that demonstrates nothing | Fixture authoring is its own phase with its own budget and a named owner |
| Recorder exposes real client data | Record a seeded synthetic campaign; redaction stays in-pipeline as a second layer |
| No per-vertical rollback | Stated acceptance for a two-person internal tool; must be revisited before a client app has real users |
| A fixture entity resolves to a real business | ASIC search every invented name before committing |
| Trace ages | Date-stamp it in the UI and accept the drift |
