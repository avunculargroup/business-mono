# Demo App — spec review and revised build plan

Reconciliation of the [`demo-app`](./README.md) spec bundle against the live repository, and
the revised session plan that follows from it. Same purpose as
[`docs/features/html-pdf-monitoring/build-progress.md`](../html-pdf-monitoring/build-progress.md).

**Status:** Phases 0 and 1 complete — Phase 1 pending a one-time baseline bootstrap that needs
Docker. All four decisions settled, all eight assumptions resolved. Phase 2 (`@platform/ui` tokens)
is next.
**Last updated:** 2026-08-08

---

## Why this document exists

The bundle in this folder was added in one commit and states its own limitation at
[`assumptions.md:10-12`](./assumptions.md):

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

Two structural consequences follow, both handled in Phase 3:

- **It is built one domain at a time**, each vertical independently verifiable and committable, so
  there is never a long-lived branch carrying a half-migrated app.
- **The bundle must be splittable.** `apps/web` will have ~20 repositories; the demo renders 7
  surfaces. A monolithic `RepositoryBundle` would force `data-fixtures` to fixture domains nobody
  demos. So `packages/data` exports per-domain interfaces, `apps/web` composes the full bundle, and
  `apps/demo` composes a partial one typed to the slice its routes actually use. This is a change
  from [`repository-contract.md:300-311`](./repository-contract.md), which specifies a single flat
  bundle.

**Auth stays on the raw client.** `middleware.ts` and the auth gate in `app/(app)/layout.tsx` are
not a repository concern and do not move. This matches the done-condition at
[`README.md:72`](./README.md) ("returns only the provider wiring and auth").

#### A third consumer is anticipated — scope at construction, never per call

A client-facing app reusing this UI is under consideration. That is the strongest case for the full
seam: one consumer makes it overhead, three make it infrastructure. It also forces one design rule
that must be settled **before vertical 3.1**, because it is nearly free now and expensive to
retrofit across ~20 repositories.

The demo and a client app stress the seam along different axes. The demo swaps the **data source** —
same query, fixtures instead of Postgres. A client app swaps the **data scope** — same source,
restricted rows. The bundle as specced only solves the first.

**The rule: scoping belongs at bundle construction, never in a method signature.**
`createSupabaseRepositories(client, principal)` returns a bundle that cannot see rows outside its
principal. No read method ever takes a `clientId`, `tenantId` or equivalent parameter. A
`clientId` argument would put the security boundary in ~200 call sites, any one of which can pass
the wrong value; construction-time scoping means a caller has no way to ask the wrong question.

This is a constraint to hold, not a redesign — [`repository-contract.md:317-320`](./repository-contract.md)
already builds the bundle from a per-request client.

Related: `mode` becomes `'live' | 'demo' | 'client'`. The review rule at
[`repository-contract.md:312-315`](./repository-contract.md) — that branching on `mode` for anything
beyond chrome means the seam has failed — gets **stricter** with a third consumer, not looser. A
client app must differ by scope, never by branch.

**Two things the seam does not give you**, flagged so they are not discovered late:

- **RLS.** `CLAUDE.md` documents the current policy as "authenticated team members can read/write
  everything (two-person team)". A client-facing app invalidates that. Real policies and roles are
  database work; the seam surfaces the need but does not satisfy it, and defence in depth wants
  both layers.
- **Compliance.** [`assumptions.md:121-122`](./assumptions.md) currently rules a client app "out of
  scope entirely, and should stay out — it is a different audience with different compliance
  obligations". That reasoning still holds for *this* build; it now needs revisiting as a deliberate
  decision rather than being left to drift. Phase 0 should reword it from a prohibition to a
  deferral with the compliance question named.

### Consequence of decision 3 — the trace loses Signal

`variant` is web-gated, so [`demo-app-spec.md:196-198`](./demo-app-spec.md)'s inbound Signal
approval message is no longer what the trace shows. The replacement is better for a technical
evaluator: the web app cannot reach the agent server over HTTP, so `/content` writes
`content_items.pending_decision` and a Supabase Realtime listener claims it atomically before
resuming the suspended run. A real distributed-systems decision, visible in the trace.

`variant` was chosen over `strategy` despite having one gate rather than two, because its
`variant.compliance_check` step invokes Lex — which puts `compliance-as-alignment` inside the trace
rather than only in a static annotation, winning back some of what decision 1 removed.

### Consequence of decision 4 — deployment

`robots.txt` and a `noindex` meta tag, against
[`demo-app-spec.md:241`](./demo-app-spec.md) ("robots.txt allows indexing. Being findable is the
point"). Update that line in Phase 0. Everything else in the deployment section stands: separate
Vercel project, `demo.btreasury.com.au`, no secrets in env, Open Graph card. The OG card still
matters — arguably more, since link-pasting is now the only distribution channel.

---

## Part 1 — Review

### What the bundle gets right

Keep these as written.

- **The relative-dating rule** ([`fixture-and-trace-schema.md:12-39`](./fixture-and-trace-schema.md)).
  Offsets from `ReadContext.asOf` rather than absolute dates. Zero-maintenance staging.
- **`DemoWriteBlockedError` carrying the target table**
  ([`repository-contract.md:326-334`](./repository-contract.md)), so the toast can name
  `content_items`. That specificity is the difference between a demo and a mockup.
- **The trace schema must not import `@mastra/core` types**
  ([`fixture-and-trace-schema.md:110-118`](./fixture-and-trace-schema.md)). Correct, and more
  load-bearing than the doc knows.
- **The DM Sans / Inter typo is real.** `.claude/skills/bts-design/SKILL.md:17` says Inter;
  `docs/DESIGN_BRIEF.md:107` and `apps/web/app/globals.css:48` both say DM Sans. Verified.
- **The AFSL/AR compliance constraints**
  ([`demo-app-spec.md:213-231`](./demo-app-spec.md)) — no allocation figures, no real entities,
  no reproduced publisher content. Correct and non-negotiable.
- **One contract test suite both adapters must pass**
  ([`repository-contract.md:350-358`](./repository-contract.md)). The only real defence against
  silent divergence.
- **Grep for `mode` during review** ([`repository-contract.md:312-315`](./repository-contract.md)).
- **The non-goals section** ([`README.md:125-131`](./README.md)) is disciplined. Preserve verbatim.

### Blocking finding 1 — two of the four flagship surfaces do not exist

[`demo-app-spec.md:55-63`](./demo-app-spec.md) names four surfaces at "Full" demonstration depth.
Two are not built, in any form:

| Claimed | Reality |
|---|---|
| `compliance_obligations` | Does not exist. Not in `schema.sql`, not in any of 93 migrations, not in `database.ts`. |
| `contracts`, `contract_templates` | Do not exist. Zero column matches for `renewal`, `evergreen`, `notice_period`, `obligation` across all `.sql`. |
| `v_compliance_dashboard` | Does not exist. |
| `v_contracts_overview` | Does not exist. |
| `/compliance`, `/contracts` routes | Do not exist in `apps/web/app/`. |

[`repository-contract.md:23-28`](./repository-contract.md) instructs "Do not expose raw table rows.
The views already encode the computed fields" — for views that do not exist.
[`assumptions.md:47-59`](./assumptions.md) raises `v_contracts_overview` as an open question; the
answer is no. [`repository-contract.md:209`](./repository-contract.md) says `daysUntilDecision` is
missing from the view; it is a two-level gap — the view must be created, not amended.

This matters because those surfaces carry the bundle's best material: the "key screen" fixture is
the engagement-letter decision deadline
([`fixture-and-trace-schema.md:53`](./fixture-and-trace-schema.md)), and the first required
annotation is the compliance urgency band ([`demo-app-spec.md:170`](./demo-app-spec.md)).

The bundle also rules out the obvious shortcut itself
([`assumptions.md:57-59`](./assumptions.md)):

> Do not build a fixture for a feature that does not exist in the real app — a demo showing
> something unbuilt is the one failure mode that is actually dishonest rather than merely awkward.

**Note on `schema.sql`:** it is a lagging reference. It documents 8 views where `database.ts` lists
23, and carries a stale `agent_activity.status` CHECK (missing `in_progress`, added by
`20260428130000`). Migrations win.

### Blocking finding 2 — the trace centrepiece has no subject

The two docs disagree, and both are wrong:

- [`README.md:102`](./README.md): "Record one Simon run end to end: proposal, suspend, human
  approval, resume, commit to `agent_activity`." **Simon cannot suspend** —
  `apps/agents/src/agents/simon/index.ts` is a Mastra `Agent`, driven by the Signal polling loop.
  Only workflows suspend.
- [`assumptions.md:71`](./assumptions.md): "the daily compliance workflow". **No such workflow.**
  The eight registered workflows (`apps/agents/src/mastra/index.ts:169-178`) are `recorder`, `pm`,
  `executeRoutine`, `pruneStorage`, `ecosystemScan`, `newsletter`, `variant`, `strategy`.

The real candidate is richer than what was specced. The **newsletter workflow**
(`apps/agents/src/workflows/newsletter/index.ts`) has two human gates — `gate1` at line 178,
`gate2` at line 538 — resumable from **both** Signal (`listeners/newsletterGate.ts`) and web
(`listeners/newsletterGateWeb.ts`, via `newsletter_runs.pending_decision`), committing at the
`persist` step (line 646) to `content_items` plus an `agent_activity` row carrying
`workflow_run_id`.

[`assumptions.md:70-76`](./assumptions.md) sends the recorder author to
`node_modules/@mastra/core/dist/docs/`; `node_modules` is not installed in a fresh checkout, so
that check needs `pnpm install` first. More usefully, **the hook already exists and is already in
use**: `spanOutputProcessors` on the `Observability` config (`apps/agents/src/mastra/index.ts:103-120`),
with `apps/agents/src/observability/agentActivityProcessor.ts` as a working reference. A recorder is
a second `SpanOutputProcessor` — no workflow instrumentation needed.

One trap: that file hardcodes `VALID_AGENT_NAMES` at line 19 and silently drops spans for `lex`,
`editor`, `marketAnalyst` and `newsVerifier`. Do not copy the filter into the recorder.

Pinned: `@mastra/core ^1.54.0`, `@mastra/observability ^1.16.3`.

### Blocking finding 3 — Session 1 is 3.5x its own abort threshold

[`assumptions.md:27-38`](./assumptions.md) sets the test: if more than ~30 files touch Supabase,
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
and gating everything ([`README.md:75`](./README.md)).

### Non-blocking corrections

1. **Every path and package name is wrong.** `apps/hq` → `apps/web`; `@bts/*` → `@platform/*`.
   Existing packages are `db`, `shared`, `signal`, `voice` — `voice` is undocumented in `CLAUDE.md`
   too. Shell commands at [`assumptions.md:33`](./assumptions.md) and
   [`README.md:72`](./README.md) do not run as written.
2. **The token source claim is wrong.** [`README.md:62-63`](./README.md) names
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
   ([`repository-contract.md:38-40`](./repository-contract.md)) does not hold. In RSCs an async
   fixture read resolves in the same tick and `loading.tsx` never paints. There are 31 `loading.tsx`
   files in `apps/web`, so if exercising loading states is wanted the fixture adapter needs a
   deliberate delay, not merely an `async` keyword.
5. **No Tailwind.** [`assumptions.md:39-42`](./assumptions.md) offers "a Tailwind config, a CSS
   variables file, or both". It is CSS Modules plus CSS custom properties, no PostCSS anywhere.
6. **No `vercel.json` in the repo**, so [`assumptions.md:78-81`](./assumptions.md) cannot be
   answered from the tree — deploy config is dashboard-side. `apps/web/next.config.ts` carries only
   `transpilePackages: ['@platform/db', '@platform/shared']`, the load-bearing line any new package
   must join.
7. **CI blast radius is understated.** [`demo-app-spec.md:259-263`](./demo-app-spec.md) frames the
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

Seven of the eight required annotations ([`demo-app-spec.md:168-177`](./demo-app-spec.md)) have a
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

### Phase 0 — Reconcile the bundle and verify infra (½ day, no code)

- Rewrite all five docs against the real repo: `apps/web`, `@platform/*`, real routes and tables.
- Replace the surface table at [`demo-app-spec.md:55-63`](./demo-app-spec.md) and the staging table
  at [`fixture-and-trace-schema.md:47-62`](./fixture-and-trace-schema.md) with the re-picked set.
- Correct [`README.md:102`](./README.md) and [`assumptions.md:70-76`](./assumptions.md) to the
  `variant` workflow and the `SpanOutputProcessor` hook.
- Flip [`demo-app-spec.md:241`](./demo-app-spec.md) from "robots.txt allows indexing" to `noindex`,
  per decision 4.
- Reword [`assumptions.md:121-122`](./assumptions.md) from "client app out of scope entirely, and
  should stay out" to a deferral naming the compliance question, per decision 2.
- Widen `SuspendStep.channel` in [`fixture-and-trace-schema.md:140-149`](./fixture-and-trace-schema.md)
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

**Baselines are not yet committed.** They must be generated in the CI container image, and the
sandbox this was built in has no Docker daemon and a mismatched Chromium build. Bootstrap with
`pnpm test:visual:update` (which shells out to `mcr.microsoft.com/playwright:v1.62.1-noble`), then
commit `e2e/**-snapshots/`. Until that happens the `e2e.yml` workflow will report red — it is
advisory and blocks nothing, but it is not meaningful until bootstrapped. Alternatively run the
workflow manually with `update_baselines: true` and commit the artifact it uploads.

**Status: complete, pending baseline bootstrap.** Token guard green in the blocking gate
(`pnpm test`: 73 files, 502 tests). Screenshot specs verified working locally — 19 passed in 8.8s —
against a browser override, but those images were discarded rather than committed because they
would diff against CI.

**Verify:** suite green twice in a row in CI on an unchanged tree. A flaky baseline is worse than no
baseline.

### Phase 2 — `@platform/ui`, tokens (1 day)

- Create `packages/ui` with `src/tokens.css` as the single source, moved from
  `apps/web/app/globals.css`. `globals.css` imports it and keeps only app-level resets.
- **Point `.claude/skills/bts-design/colors_and_type.css` at the package** rather than leaving a
  third copy. This resolves the three-way drift recorded in non-blocking correction 2; leaving it
  deferred means every future UI task is calibrated off a stale file.
- Repoint the specimen pages in `.claude/skills/bts-design/preview/` at the package so the Phase 1
  baselines keep testing something real.
- Add `@platform/ui` to `transpilePackages` in `apps/web/next.config.ts`, to `resolve.alias` in
  `apps/web/vitest.config.ts`, and to the `--dir` list in the `lint` script.

**Verify:** Phase 1 visual suite green with **zero** diffs — that is the whole point of having taken
baselines first. Then `pnpm --filter @platform/web build` clean, and walk `/`, `/news`, `/content`,
`/market-reports`, `/activity`.

### Phase 3 — `@platform/ui`, components (2–3 days)

- Move the 24 components in `apps/web/components/ui/` (each `X.tsx` + `X.module.css` + `X.test.tsx`)
  into `packages/ui/src/`. No Supabase coupling — this is the clean part.
- Keep deep imports; add no barrel (the repo has none anywhere).
- Give `packages/ui` its own `vitest.config.ts` mirroring `apps/web`'s node/jsdom project split.

**Verify:** visual suite green with zero diffs. `pnpm test` and `pnpm typecheck` green at root.

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
- **Settle the scoping rule before 4.1** (see decision 2): scoping lives at bundle construction,
  never in a method signature.
- The contract test harness from [`repository-contract.md:350-358`](./repository-contract.md),
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

#### 4.1 onwards — One vertical at a time

Each vertical: define its interface, implement it in `data-supabase`, convert its pages and its
server actions, rewrite its tests against a repository fake instead of the Supabase mock, verify,
commit.

| # | Vertical | Routes | Demo? |
|---|---|---|---|
| 4.1 | Agent activity + approvals | `/activity` | Yes — smallest, proves the pattern |
| 4.2 | Research and podcasts | `/news/*` (12 pages) | Yes — largest read surface |
| 4.3 | Content and campaigns | `/content/*`, `/campaigns/*` | Yes |
| 4.4 | Market reports, indicators, onchain | `/market-reports/*`, `/` | Yes |
| 4.5 | Ecosystem signals | `/signals` | Yes |
| 4.6 | CRM and company | `/crm/*` (11 pages), `/company` | Yes (companies only) |
| — | *critical path ends; below is background* | | |
| 4.7 | Discovery | `/discovery/*` | No |
| 4.8 | Projects, tasks, files, docs | `/projects/*`, `/tasks/*`, `/files`, `/docs/*` | No |
| 4.9 | Products, advisors | `/products/*`, `/advisors/*` | No |
| 4.10 | Decks and slides | `/decks/*` | No |
| 4.11 | Settings, routines, brand, simon | `/settings/*`, `/routines`, `/brand`, `/simon` | No |

**Watch items.** `app/actions/company.ts` has 21 `.from(` calls, `campaigns.ts` 17, `decks.ts` 15 —
the heavy three, and none should be first. `hooks/useRealtimeSubscription.ts` is the one
Supabase-coupled hook; Realtime has no fixture equivalent, so the demo will need it to no-op.

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

### Phase 6 — Fixture authoring (2–3 days, plus a Lex pass)

**Its own phase because it is writing, not data entry**, and because burying it inside Phase 5
guarantees it gets done in a last afternoon.
[`fixture-and-trace-schema.md:43-45`](./fixture-and-trace-schema.md) names the failure mode exactly:
"a plausible-but-flat dataset is the most common way a portfolio demo fails — everything works and
nothing is interesting."

The existing staging table at
[`fixture-and-trace-schema.md:47-62`](./fixture-and-trace-schema.md) is **void** — every row of it
was authored for compliance obligations and contracts, which decision 1 removed. It must be
re-derived for the seven re-picked surfaces, which means answering design questions, not looking
things up: what market report makes the quiet-day path legible in five seconds? What news item makes
curator notes land without explanation?

Roughly 60–100 rows across ten fixture files, plus transcript segments, plus a trace bundle that has
to agree with all of it.

Per-row obligations, none of which parallelise:

- Every company and person name invented **and ASIC-searched** to confirm it does not resolve to a
  real business ([`fixture-and-trace-schema.md:70-72`](./fixture-and-trace-schema.md))
- Research items: invented titles and paraphrased one-liners only. Reproducing publisher content is
  a copyright problem as well as a compliance one
- No bitcoin allocation figure anywhere — [`demo-app-spec.md:222`](./demo-app-spec.md) calls this
  the single highest-risk element of the build
- Internal consistency across the whole set. A trace naming different fictional entities than the
  lists "reads as sloppy and undermines the impression the demo exists to create"
  ([`fixture-and-trace-schema.md:244-247`](./fixture-and-trace-schema.md))
- Every date an offset from the anchor, never a literal

**Ownership.** The typing is delegable; the narrative decisions are not. Deciding which fixtures
make the architecture visible needs domain judgment and carries the compliance risk. Charlie can
draft prose against brand voice, but [`demo-app-spec.md:270-274`](./demo-app-spec.md) already flags
the register problem — a company voice describing an individual's work reads oddly. Chris sets the
staging table; an agent fills it in afterwards.

**Verify:** Lex classification pass over the full set, outcome logged to `agent_activity`
([`demo-app-spec.md:227`](./demo-app-spec.md)). ASIC search recorded for every invented entity.

### Phase 7 — Annotation layer (2–3 days)

- Overlay per [`demo-app-spec.md:124-181`](./demo-app-spec.md): `data-annotation-id` targets,
  absolute positioning against a relative container, keyboard-navigable markers, Product view
  default.
- Seven annotations (the eight required minus the contracts one), retargeted per the surface table.
  Plus `/architecture` prose.

**Verify:** toggle on every demo route with no layout shift. Tab to every marker. `jsx-a11y` clean.
Read all seven cold and check the architecture is describable from them alone.

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
  [`fixture-and-trace-schema.md:236-248`](./fixture-and-trace-schema.md).
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
  [`fixture-and-trace-schema.md:252-258`](./fixture-and-trace-schema.md).

**Verify:** replay with the network down. Step back across the gate boundary. Confirm no API key in
the demo's Vercel env. Confirm the recorder is disabled by default in `apps/agents`.

### Phase 9 — Demo E2E (1 day)

- Extend the Phase 1 Playwright suite to `apps/demo`: snapshot the seven surfaces, walk the
  annotation toggle, walk the trace replay transport. No auth, no backend, no stubs — the fixture
  adapter makes this the easy case.
- Promote the demo specs from advisory to blocking once baselines have settled. The demo is a public
  artefact; a silent visual break there is worse than a red build.

### Fixture drift policy

Not a philosophical question — a weekly operational one. Measured: **25 migrations in the three
weeks to 2026-08-03**, many hitting demo-surface tables directly (`add_content_feedback`,
`add_market_report_feedback`, `add_news_item_image`, `add_podcast_collections`,
`add_findings_engine`, `add_ecosystem_signals`). CI runs `pnpm typecheck` workspace-wide, so a
migration PR touching a demo surface will go red on fixture compile roughly every week.

**Policy:** start in the shared gate, per [`demo-app-spec.md:262`](./demo-app-spec.md). The compile
failure is the drift alarm and it is doing its job. Fixture updates are expected to be one-line
additions; keep the fixture set narrow so they stay that way.

**Escape hatch, defined in advance so it is not litigated mid-PR:** if fixing fixtures blocks an
unrelated PR by more than ~15 minutes on three separate occasions, move `@platform/demo` and
`@platform/data-fixtures` typecheck out of the PR gate into the nightly `e2e.yml` workflow. Drift is
then caught within a day instead of instantly, which is the right trade once the alarm has proven
noisy. Do **not** reach for `Partial<>` fixture types
([`assumptions.md:98-102`](./assumptions.md)) — that trades the alarm away permanently for a
convenience that a nightly job provides without loss.

### Deferred deliberately

- The gated live-inference path ([`demo-app-spec.md:201-209`](./demo-app-spec.md)). Ship only if
  everything above is stable.
- The sidebar responsive collapse ([`assumptions.md:111-117`](./assumptions.md)). A real gap —
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
