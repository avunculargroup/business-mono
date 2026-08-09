# Demo App — spec review and revised build plan

Reconciliation of the [`demo-app`](./README.md) spec bundle against the live repository, and
the revised session plan that follows from it. Same purpose as
[`docs/features/html-pdf-monitoring/build-progress.md`](../html-pdf-monitoring/build-progress.md).

**Status:** nothing built. All four decisions settled. Ready to start Phase 0.
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
   The skill's `colors_and_type.css` is a third copy, already drifted: it defines
   `--color-agent-pending` which globals lacks; globals defines `--color-warning-subtle`,
   `--color-surface-active`, `--tap-highlight`, `--press-scale`, `--sidebar-collapsed-width` and
   others which it lacks. Three copies, two drifts, plus the font typo.
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

### Phase 0 — Reconcile the bundle (½ day, no code)

- Rewrite all five docs against the real repo: `apps/web`, `@platform/*`, real routes and tables.
- Replace the surface table at [`demo-app-spec.md:55-63`](./demo-app-spec.md) and the staging table
  at [`fixture-and-trace-schema.md:47-62`](./fixture-and-trace-schema.md) with the re-picked set.
- Correct [`README.md:102`](./README.md) and [`assumptions.md:70-76`](./assumptions.md) to the
  newsletter workflow and the `SpanOutputProcessor` hook.
- Mark each verified assumption in [`assumptions.md`](./assumptions.md) resolved, with its answer.
- Fix `.claude/skills/bts-design/SKILL.md:17` Inter → DM Sans. Record the three-way token drift as a
  known issue; do not fix it here.

**Verify:** every path in the bundle resolves; every table and view named exists in
`packages/db/src/types/database.ts`.

### Phase 1 — `@platform/ui`, tokens only (1 day)

- Create `packages/ui` with `src/tokens.css` as the single source, moved from
  `apps/web/app/globals.css`. `globals.css` imports it and keeps only app-level resets.
- Add `@platform/ui` to `transpilePackages` in `apps/web/next.config.ts`, to `resolve.alias` in
  `apps/web/vitest.config.ts`, and to the `--dir` list in the `lint` script.

**Verify:** `pnpm --filter @platform/web build` clean; walk `/`, `/news`, `/content`,
`/market-reports`, `/activity` and confirm no visual change.

### Phase 2 — `@platform/ui`, components (2–3 days)

- Move the 24 components in `apps/web/components/ui/` (each `X.tsx` + `X.module.css` + `X.test.tsx`)
  into `packages/ui/src/`. No Supabase coupling — this is the clean part.
- Keep deep imports; add no barrel (the repo has none anywhere).
- Give `packages/ui` its own `vitest.config.ts` mirroring `apps/web`'s node/jsdom project split.

**Verify:** `pnpm test` and `pnpm typecheck` green at root. Walk the same five pages.

### Phase 3 — `@platform/data`, full seam (4–6 weeks)

Per decision 2, every page and server action in `apps/web` moves behind repository interfaces. Built
as independent domain verticals so the app is shippable at every commit.

#### 3.0 — Foundation (2–3 days)

- `packages/data` — `context.ts` (`ReadContext`, `QueryOptions`, `Paginated`), `errors.ts`
  (`DemoWriteBlockedError`, `NotFoundError`), the per-domain interface convention, and the
  composable provider. Interfaces only, no implementations.
- The contract test harness from [`repository-contract.md:350-358`](./repository-contract.md),
  written once and parameterised over an adapter, so each vertical adds its cases rather than its
  own harness.
- `packages/data-supabase` scaffold. `ReadContext.asOf` defaults to `new Date()` here so `apps/web`
  call sites can omit it.
- Mount the provider alongside `UserProvider` / `ToastProvider` in `apps/web/app/(app)/layout.tsx`.
  `UserProvider` types straight off `@platform/db` — flagged, not fixed.
- Add `@platform/data` and `@platform/data-supabase` to `transpilePackages`, the vitest
  `resolve.alias` map, and the lint `--dir` list.

#### 3.1 onwards — One vertical at a time

Each vertical: define its interface, implement it in `data-supabase`, convert its pages and its
server actions, rewrite its tests against a repository fake instead of the Supabase mock, verify,
commit. Ordered so the demo surfaces land first — they unblock Phase 4, and the rest can proceed in
parallel with fixture authoring.

| # | Vertical | Routes | Demo? |
|---|---|---|---|
| 3.1 | Agent activity + approvals | `/activity` | Yes — smallest, proves the pattern |
| 3.2 | Research and podcasts | `/news/*` (12 pages) | Yes — largest read surface |
| 3.3 | Content and campaigns | `/content/*`, `/campaigns/*` | Yes |
| 3.4 | Market reports, indicators, onchain | `/market-reports/*`, `/` | Yes |
| 3.5 | Ecosystem signals | `/signals` | Yes |
| 3.6 | CRM and company | `/crm/*` (11 pages), `/company` | Yes (companies only) |
| 3.7 | Discovery | `/discovery/*` | No |
| 3.8 | Projects, tasks, files, docs | `/projects/*`, `/tasks/*`, `/files`, `/docs/*` | No |
| 3.9 | Products, advisors | `/products/*`, `/advisors/*` | No |
| 3.10 | Decks and slides | `/decks/*` | No |
| 3.11 | Settings, routines, brand, simon | `/settings/*`, `/routines`, `/brand`, `/simon` | No |

**Watch items.** `app/actions/company.ts` has 21 `.from(` calls, `campaigns.ts` 17, `decks.ts` 15 —
these three are the heavy ones and should not be first. `lib/action.ts:getAuthedClient()` is the
existing wrapper every action goes through; it is the natural place to hand back a repository bundle
instead of a raw client, and converting it early makes each subsequent vertical smaller.
`hooks/useRealtimeSubscription.ts` is the one Supabase-coupled hook and needs a decision of its own —
Realtime has no fixture equivalent, so the demo will need it to no-op.

**Verify per vertical:** contract suite green for that domain; its tests rewritten and passing; the
vertical's pages walked manually — types will not catch a wrong `.order()`. Commit before the next.

**Verify at the end of Phase 3:** `grep -rl "createClient" apps/web/` returns only `middleware.ts`,
the auth gate, and the provider wiring.

**`apps/web` must be verified working and committed before `apps/demo` exists.**

### Phase 4 — `apps/demo` and `@platform/data-fixtures` (4–5 days)

- Scaffold `apps/demo` (Next.js App Router). No `@supabase/*`, no `@mastra/*`, no AI SDK in its
  `package.json`, enforced by it simply not depending on `@platform/data-supabase`.
- `packages/data-fixtures` implementing **only the seven demo domains** (verticals 3.1–3.6), mounted
  as a partial bundle per decision 2. Static typed objects, no runtime fetch, no filesystem reads.
  Writes throw `DemoWriteBlockedError(operation, table)`.
- `useRealtimeSubscription` no-ops in the demo — there is no fixture equivalent of a live
  subscription, and a silent no-op is more honest than a fake event stream.
- Author fixtures per the revised staging table, keeping the offset-from-anchor rule verbatim.
  Fictional-entity and no-allocation-figure rules apply in full.
- Demo chrome: disclosure banner, `Demo data` chip, write-blocked toast naming the real table.

**Verify:** `pnpm --filter @platform/demo build && start` with the network interface down. Contract
suite green against both adapters. `grep -r "mode" apps/demo/` shows `mode` driving only chrome.

### Phase 5 — Annotation layer (2–3 days)

- Overlay per [`demo-app-spec.md:124-181`](./demo-app-spec.md): `data-annotation-id` targets,
  absolute positioning against a relative container, keyboard-navigable markers, Product view
  default.
- Seven annotations (the eight required minus the contracts one), retargeted per the surface table.
  Plus `/architecture` prose.

**Verify:** toggle on every demo route with no layout shift. Tab to every marker. Read all seven
cold and check the architecture is describable from them alone.

### Phase 6 — Trace recorder and replay (4–5 days)

- `pnpm install` first, then read `node_modules/@mastra/core/dist/docs/` for the 1.54.0 surface.
- Recorder: a second `SpanOutputProcessor` registered next to `AgentActivitySpanProcessor` in
  `apps/agents/src/mastra/index.ts:103-120`, behind an env flag, off by default. Translate spans
  into the BTS-owned `TraceBundle`. **Do not copy the `VALID_AGENT_NAMES` filter** from
  `agentActivityProcessor.ts:19` — it would drop `lex` spans, and the Lex compliance gate is part
  of what the variant trace is for.
- Record one `variant` run end to end (`apps/agents/src/workflows/variant/index.ts`): the
  `variant.generate_copy` step, the `variant.compliance_check` step invoking Lex, then the `gate3`
  suspend at lines 327-388, resumed by `startVariantGateWebListener` off
  `content_items.pending_decision` (`workflows/variant/run.ts:50-60`), through to the
  `agent_activity` write at lines 116 and 126.
- The Lex step is the reason this workflow was chosen — render its verdict as a first-class trace
  step, not a tool call. `agents/compliance/index.ts:121` (`verdictToActivity`) writes
  `status: 'pending'` on a fail and `'auto'` on a pass, with a `suggested_rewrite` proposed action;
  that branch is worth showing.
- The `TraceStep` union in [`fixture-and-trace-schema.md:140-149`](./fixture-and-trace-schema.md)
  assumes `channel: 'signal'` on `SuspendStep`. Widen it to `'signal' | 'web'` and render the web
  path as the `pending_decision` write plus the Realtime claim, not as a chat message.
- Redact during recording, never after
  ([`fixture-and-trace-schema.md:236-248`](./fixture-and-trace-schema.md)).
- `packages/agent-traces` for the schema and recorded JSON, imported statically.
- Replayer in `apps/demo` at `/agents/run/[traceId]`, driving the same components, with the
  transport controls and compression function from
  [`fixture-and-trace-schema.md:252-258`](./fixture-and-trace-schema.md).

**Verify:** replay with the network down. Step back across both gate boundaries. Confirm no API key
in the demo's Vercel env. Confirm the recorder is disabled by default in `apps/agents`.

### Deferred deliberately

- The gated live-inference path ([`demo-app-spec.md:201-209`](./demo-app-spec.md)). Ship only if
  everything above is stable.
- The sidebar responsive collapse ([`assumptions.md:111-117`](./assumptions.md)). A real gap —
  recruiters do open links on phones — but it is `apps/web` work that should be justified on its own
  merits, not smuggled in.
- The three-way token drift between `globals.css`, `DESIGN_BRIEF.md` and the skill's
  `colors_and_type.css`. Documented in Phase 0, fixed separately.

---

## End-to-end verification

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` green at root — the PR gate in
   `.github/workflows/test.yml`.
2. Contract suite in `packages/data` passes against both adapters.
3. `apps/web` walked manually across all refactored pages — types do not catch query-shape bugs.
4. `apps/demo` builds and runs with the network disabled.
5. `grep -r "@supabase\|@mastra" apps/demo/package.json` returns nothing.
6. A token change in `packages/ui/src/tokens.css` appears in both apps with no further edits.
7. Fixture set reviewed against Lex's classification rules before deploy, outcome logged to
   `agent_activity` ([`demo-app-spec.md:227`](./demo-app-spec.md)).
8. Someone with no context reads the demo cold and can describe "deterministic before LLM".

## Risk register

| Risk | Mitigation |
|---|---|
| Phase 3 regresses working `apps/web` pages | One vertical at a time, each walked manually and committed before the next; the app is shippable at every commit |
| Phase 3 stalls half-migrated | Vertical ordering puts demo surfaces first, so Phase 4 unblocks even if 3.7–3.11 slip; a partly-converted app is inconsistent but not broken |
| ~40 tests rewritten from Supabase mocks to repository fakes | Budget it explicitly per vertical rather than discovering it late; the repository fake is a much smaller surface than `test/mocks/supabase.ts` |
| Fixture drift blocks unrelated PRs | Accepted initially per [`demo-app-spec.md:259-263`](./demo-app-spec.md); revisit if it bites twice |
| Mastra upgrade breaks the recorder | Schema is BTS-owned; only the recorder needs updating, and the recorded bundle keeps working |
| A fixture entity resolves to a real business | ASIC search each name before committing |
| Trace ages | Date-stamp it in the UI and accept the drift |
