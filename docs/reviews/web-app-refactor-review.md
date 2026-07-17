# Review: Web App (`apps/web`) — Refactoring Opportunities

**Date:** 2026-07-16 · **Status:** in progress — all three P1 items shipped; P2/P3 open (see Progress log).

## Progress log

Each item is tagged ☐ todo · ◐ in progress · ☑ done. Update as work lands.

| Item | Status | Notes |
|------|--------|-------|
| 1. Finish `getAuthedClient()` migration | ☑ done | 2026-07-17 — migrated every mutating server action across 29 files to the `getAuthedClient()` preamble; read-only `get*` helpers keep raw `createClient()`. Writes previously attributed via `user?.id ?? null` now use the guaranteed `user.id` (dropping the redundant `auth.getUser()` round-trip). `auth.ts` (the sign-in flow) and read-only `podcastSearch.ts` deliberately left on `createClient()`. Typecheck + lint + 271 web tests green. |
| 2. One error contract for server actions | ☑ done | 2026-07-16 — 21 raw `throw new Error(error.message)` across 12 read helpers now throw `humanizeError(error)`; `podcastSearch.ts` re-throws the original error so its existing catch humanizes with the Postgres `code` intact. Typecheck + 271 web tests green. |
| 3. Delete stale type-cast escape hatches | ☑ done | 2026-07-16 — removed all Database-related `any` casts (read pages/components + `campaigns.ts` `AnyDb`) and every `as never` write-cast in the action files, restoring column/type checking on inserts & updates. Typed `routines.buildActionConfig` → `Json`; asserted three genuine boundaries honestly (see notes below). Standardised the 9 `Database` imports on `@platform/db` and deleted the dead `lib/database.ts`. Left deferred: the `useRealtimeSubscription` channel `as never` casts (hygiene item) and test fixtures. **Surfaced:** `v_campaign_matrix.slug` (human-friendly-slugs migration) is missing from the generated view type — the types lag that migration for this view column; a `pnpm --filter @platform/db generate-types` run would let the `as unknown as MatrixRow[]` narrow revert to a plain assertion. Typecheck + 271 web tests green. |
| 4. Shared form hook + field components | ☐ todo | |
| 5. Promote shared form stylesheet | ☐ todo | |
| 6. Shared CRUD list-page scaffold | ☐ todo | |
| 7. Shared parse/map helpers for CRUD actions | ◐ in progress | 2026-07-17 — added `lib/forms.ts`: `parseForm(schema, formData)` (returns `{ ok, data }` \| `{ ok, error }`, mirroring `getAuthedClient`) and `buildUpdate(data)` (the standardised loop-skip update mapper, `''`-stripped via an `Exclude` return type). Tested (`lib/forms.test.ts`). Adopted in 8 CRUD files (contacts, companies, advisors, products, projects, brand, segments, personas). Remaining parse sites (champions, community, feedback, interviews, lexicon, pipeline, tasks, documents, templates) follow the identical mechanical swap — incremental. |
| 8. One set of Supabase client factories | ☐ todo | |
| 9. Centralise status→label/color maps | ☐ todo | |
| 10. Decompose the three giant client views | ☐ todo | |
| 11. Shared reference-data fetchers + revalidation | ☐ todo | |
| 12. Board abstraction | ☐ todo | deferred until a 4th board appears |

## Context

`apps/web` is the internal BTS operations dashboard (Next.js 15 App Router /
React 19 → Vercel): ~400 TS/TSX files, ~37k lines, 35 server-action files,
~190 components, CSS modules over design tokens. This review catalogues
refactoring opportunities, ranked by priority (correctness and type-safety
first, then duplication with the highest line-count payoff, then structural
consolidation, then hygiene).

It builds on `docs/reviews/nextjs-app-review.md` (five improvements, all
shipped). Two threads from that review resurface here: the `getAuthedClient()`
helper it introduced was adopted in only 4 files (item 1), and its top deferred
follow-up — a shared `FormField` — turns out to be one corner of a much larger
form-duplication problem (item 4).

Method: full-codebase sweep of `app/(app)/` pages, `app/actions/`,
`components/`, `lib/`, hooks, tests, and config. All counts below were
verified by grep against the current tree.

---

## P1 — Correctness and type-safety

### 1. Finish the `getAuthedClient()` migration (31 action files to go)

**Problem.** `lib/action.ts` exposes `getAuthedClient()` — built precisely to
make the auth contract uniform across server actions — but only 4 of 35 action
files use it (`approvals.ts`, `companies.ts`, `contacts.ts`, `tasks.ts`). The
other 31 call raw `createClient()` from `@/lib/supabase/server` and rely
entirely on RLS with no explicit user assertion (e.g. `products.ts`,
`podcasts.ts`, `champions.ts`). The helper's own docstring documents the
problem it was written to fix.

**Recommendation.** Mechanical migration: replace the inline client creation
in every mutating action with the three-line `getAuthedClient()` preamble. The
shared test mock already supports `auth.getUser`/`__setUser`, so each migrated
file can pick up the signed-out-path test for free.

**Effort:** low per file, moderate in aggregate. Purely mechanical; a good
batch-PR or several small ones.

### 2. One error contract for server actions — stop throwing raw Postgres text

**Problem.** Two conventions coexist, sometimes in the same file. Mutations
return `{ error: humanizeError(error) }` (good — used in all 35 files). But
read helpers (`get*`) instead `throw new Error(error.message)`, leaking the
raw PostgREST text that `humanizeError()` exists to suppress — 21 raw throws
across 12 files: `company.ts` (4), `champions.ts` (3), `documents.ts`,
`interviews.ts`, `pipeline.ts`, `templates.ts` (2 each), plus `assets.ts`,
`community.ts`, `decks.ts`, `feedback.ts`, `lexicon.ts`, `podcastSearch.ts`.
These throws surface through the shared `app/(app)/error.tsx` boundary with
jargon the humane-error layer was built to avoid. An unused convenience
wrapper `actionError()` already sits in `lib/errors.ts` for exactly this.

**Recommendation.** Pick one convention: reads throw
`new Error(humanizeError(error))` (the error boundary displays the message),
or return a discriminated result like mutations do. Either way, no raw
`error.message` leaves an action.

**Effort:** low. 21 call sites, one-line each.

### 3. Delete the now-stale type-cast escape hatches

**Problem.** 13 `any` casts (12 files, each with an
`eslint-disable no-explicit-any`) and `as never` write-casts in 10 action
files were added because post-migration tables were missing from the generated
`Database` types — the code comments say so (`podcasts.ts`, `campaigns.ts`'s
`type AnyDb = { from: (t: string) => any }`, `NewsletterRunStatus.tsx`'s
`createClient() as any`). The types have since been regenerated (commit
`01bda76`) and now include `newsletter_runs`, `campaigns`, `campaign_matrix`,
`campaign_overview`, and `workflow_progress` — so most of these casts are dead
guards that silently disable column checking on every query they touch.

Related: `lib/database.ts` re-exports `Database` via the deep relative path
`../../../packages/db/src/types/database` instead of `@platform/db` (which
already exports it), and imports are split between `@/lib/database` and
`@platform/db` across 18 files.

**Recommendation.** Remove the casts file by file, fixing whatever genuine
mismatches surface at the boundary (the previous review's item 2 is the
playbook — it removed 67 casts the same way). Standardise `Database` imports
on `@platform/db` and delete `lib/database.ts`.

**Effort:** low–medium. Typecheck drives the whole change.

---

## P2 — High-ROI duplication

### 4. Shared form hook + field components (~26 forms duplicate the same scaffold)

**Problem.** The biggest duplication in the app. 26 `*Form.tsx` components
repeat a near line-identical ~25-line scaffold: `useToast()`, a
`handleSubmit(_prev, formData)` with the same create/edit branch and
toast-on-error/success flow, `useActionState`, a
`useEffect(() => onPendingChange?.(isPending))` relay (`onPendingChange` is
threaded through 49 files), and the same
`<div className={styles.field}><label className={styles.label}>…` field
markup. Compare `crm/CompanyForm.tsx`, `crm/ContactForm.tsx`,
`crm/SegmentForm.tsx`, `crm/ChampionForm.tsx` — the non-JSX bodies are
interchangeable.

**Recommendation.** A `useEntityForm({ create, update, mode, defaultValues,
entityLabel, onSuccess, onPendingChange })` hook returning
`{ formAction, isPending, state }`, plus `FormField` / `FormRow` / `FormSelect`
components in `components/ui/`. This also closes the largest deferred a11y
item from the previous review — `FormField` is where `htmlFor`/`id` +
`aria-describedby` wiring belongs (47 components currently have unassociated
labels).

**Effort:** medium. Build the hook + fields once, then migrate forms
incrementally — each migration deletes ~25 lines and some markup.

### 5. Promote the de-facto shared form stylesheet to `components/ui/`

**Problem.** There is no shared form stylesheet, so forms cross-import other
features' CSS modules: `crm/ChampionForm.tsx`, `crm/CommunityForm.tsx`, and
`crm/ChampionEventLog.tsx` import `../discovery/DiscoveryForm.module.css` (7
files across two features use that one sheet); `crm/CompanyForm.tsx` and
`crm/InteractionForm.tsx` import `./ContactForm.module.css`;
`crm/SegmentForm.tsx` imports `./InterviewForm.module.css`;
`settings/FastmailExclusionForm.tsx` imports
`./FastmailAccountForm.module.css`. The `.form/.field/.label/.input/.row/
.select/.textarea/.error` class set is effectively identical everywhere.
Similarly, `.chip`/`.badge` styles that `ui/StatusChip` already provides are
re-declared in ~8 feature modules (`crm/InterviewDetail`, `docs/DocForm`,
`campaigns/VariantEditor`, `dashboard/IndicatorCard`, …).

**Recommendation.** Extract one `components/ui/Form.module.css` (or fold the
styles into the item-4 field components) and point the cross-importers at it.
Replace hand-rolled chip markup with `StatusChip`/`AgentBadge` where the
semantics match.

**Effort:** low. Mostly import-path changes; pairs naturally with item 4.

### 6. Shared CRUD list-page scaffold (~8 list components)

**Problem.** `crm/PersonasList`, `ChampionsList`, `CompaniesList`,
`ContactsList`, `InterviewsList`, `SegmentsList`, `discovery/FeedbackList`,
and `tasks/TasksView` all repeat the same wiring: a `showCreate` / `editX` /
`deleteTarget` state triad, an async `handleDelete`, `<DataTable>` with
View/Edit/Delete row actions, a create `<SlideOver>`, an edit `<SlideOver>`,
and a `<ConfirmDialog>` (`deleteTarget` appears in 14 files). Also
inconsistent: 11 files use the existing `hooks/useOptimisticList`, while
`ChampionsList` and `discovery/PipelineBoard` hand-roll
`useState` + `setItems(prev => prev.filter(...))` for the same job.

**Recommendation.** A `useEntityList` hook (or `<CrudListShell>` wrapper)
that owns the create/edit/delete dialog state and delete flow, composed with
`useOptimisticList`. Migrate the two hand-rolled components onto
`useOptimisticList` regardless.

**Effort:** medium. The DataTable/SlideOver/ConfirmDialog primitives already
exist and are consistently adopted — this is just the wiring layer.

### 7. Shared parse/map helpers for server-action CRUD

**Problem.** Every create/update action repeats the same block:
`Object.fromEntries(formData.entries())` → `schema.safeParse` →
`return { error: parsed.error.errors[0].message }` → insert/update →
`humanizeError` → `revalidatePath`. It appears ~30 times, with hand-written
`d.field || null` column mapping per action — and three *different* update
strategies for the same problem: `contacts.ts` loops over entries,
`tasks.ts` hand-writes `if (data.x !== undefined)` per field, `products.ts`
blindly overwrites all columns.

**Recommendation.** Not a heavy action factory — just shared helpers: a
`parseForm(schema, formData)` that returns the parsed data or the
first-issue error string, and a null-coalescing column mapper. Pick one
update strategy (the `contacts.ts` loop generalises best) and document it.

**Effort:** low–medium. Helpers are an hour; adoption is incremental.

---

## P3 — Structural consolidation

### 8. One set of Supabase client factories

**Problem.** `apps/web/lib/supabase/server.ts` and `browser.ts` re-implement
`createServerClient`/`createBrowserClient` factories that already exist in
`packages/db/src/server.ts` and `browser.ts` — which are explicitly labelled
"Web app client factories" in the package's index yet are imported by zero
files (dead code). `middleware.ts` inlines a fourth copy of the
URL/anon-key/cookie plumbing.

**Recommendation.** Either adopt the `@platform/db` factories in the app (and
share the cookie plumbing with middleware where possible), or delete the
unused package factories and accept `apps/web/lib/supabase/` as the single
home. Both are fine; having both is not.

**Effort:** low. Decision plus a handful of import changes.

### 9. Centralise status→label/color maps next to the shared enums

**Problem.** Enum *values* come from `@platform/shared` (imported in 63
files) and many label maps live there too (`CHAMPION_STATUS_LABELS`, etc.) —
but the *color* maps and several label maps are re-declared per component:
`PipelineChip.tsx` (`stageColors`), `ChampionsList.tsx` (`STATUS_COLORS`),
`TasksView.tsx` (`statusColors`), `ContentBoard.tsx` (`typeColors`), and
~40 files with local map literals overall. `AgentActivityCard.tsx`
(`AGENT_LABELS`) and `RoutineForm.tsx` (`AGENT_OPTIONS`, "Rex — Researcher")
hardcode agent lists that duplicate `AGENT_REGISTRY` in
`packages/shared/src/agents.ts`.

**Recommendation.** Ship label maps for the enums that lack them
(`TaskPriority`, `PipelineStage`) in `@platform/shared` alongside the
existing ones; keep color assignments in the chip components
(`StatusChip`/`PriorityChip`/`PipelineChip`) as the single visual source of
truth; derive agent pickers/labels from `AGENT_REGISTRY`.

**Effort:** low–medium, spread wide. Each map moved deletes a copy.

### 10. Decompose the three giant client views

**Problem.** Three files mix reusable pieces into monoliths:

- `app/(app)/files/FilesView.tsx` (913 lines): ~22 `useState` hooks driving
  four dialogs (upload/preview/rename/tags), plus embedded `TagInput` and
  `FileIcon` components, `formatBytes`/`isImage`/`isPdf` utils, and a raw-XHR
  `uploadWithProgress` helper.
- `app/(app)/news/podcasts/PodcastDashboard.tsx` (622 lines): inline chart
  primitives (`KpiCard`, `StackedBar`, `AreaChart`, `Select`), a `BriefForm`,
  and ~10 aggregation `useMemo`s that belong in a `podcastMetrics` util.
- `app/(app)/routines/RoutineForm.tsx` (582 lines): embeds a `ChipInput`
  that near-duplicates FilesView's `TagInput`.

**Recommendation.** Extract the named sub-components and utils (a shared
`ui/TagInput` unifying the two chip inputs, `components/podcasts/charts`,
`lib/podcasts` metrics, `lib/files` format utils), then split each view's
dialogs into their own components. No behaviour change intended.

**Effort:** medium per file, independent per file.

### 11. Shared reference-data fetchers + one revalidation convention

**Problem.** The form-picklist queries are copy-pasted:
`from('companies').select('id, name').order('name')` in 9+ pages,
`from('team_members').select('id, full_name')` in 8. `revalidatePath` targets
are duplicated string literals per action (only `podcasts.ts` centralises a
`REVALIDATE` constant), the `'/'` dashboard revalidation is applied
inconsistently (tasks/contacts yes; products/champions no), and the podcast
surface double-invalidates — actions call `revalidatePath` *and* the client
(`EpisodeDetail.tsx`, `PodcastDashboard.tsx`) calls `router.refresh()`.

**Recommendation.** `getCompanyOptions()` / `getTeamMemberOptions()` helpers
in `lib/`; per-feature `REVALIDATE` path constants; drop the client-side
`router.refresh()` where the action already revalidates. (The previous
review's deferred `revalidateTag` idea remains the fuller fix, but path
constants are the cheap 80%.)

**Effort:** low.

### 12. Board abstraction — only if boards keep multiplying

**Problem.** `tasks/KanbanBoard.tsx` (227), `discovery/PipelineBoard.tsx`
(258) and `content/ContentBoard.tsx` (224) share the same skeleton — static
column list keyed on a status field, `useMemo` grouping, optimistic status
change — plus ~600 lines of near-identical `.board/.column/.card` CSS across
their modules. But they deliberately diverge on interaction: dnd-kit
drag-and-drop vs arrow buttons vs archive action.

**Recommendation.** Lowest priority of the twelve. Share the board/column
*layout* (one stylesheet + a `<Board columns items groupBy renderCard>`
shell) and keep the move-interaction per-feature. Do this the next time a
fourth board appears rather than as a standalone project — forcing the three
interaction models through one abstraction today buys little.

**Effort:** medium, and easy to over-engineer — hence last.

---

## Smaller hygiene items

- **No `not-found.tsx` anywhere** despite `notFound()` calls in many detail
  pages (`tasks/[id]`, `crm/*/[id]`, …) — users get the unstyled Next.js
  default 404. One `app/(app)/not-found.tsx` using `EmptyState` fixes it.
- **Middleware matcher is broad**: `auth.getUser()` (a network round-trip)
  runs on essentially every request, with `/share/*` exempted in code rather
  than in the matcher. Narrowing the matcher trims latency on public paths.
- **5 files hand-roll date formatting** (`discovery/PipelineBoard`,
  `company/DomainsSection`, `company/SubscriptionsSection`, `news/NewsCard`,
  `news/daily/page.tsx`) instead of the timezone-aware formatters in
  `lib/utils.ts` (used by 42 files).
- **Test coverage is lopsided**: 5 of 35 action files tested, 0 of 5 hooks,
  and whole features (campaigns, crm, discovery, decks, company) untested —
  while the shared `test/mocks/supabase.ts` fake makes action tests cheap.
  Items 1, 4 and 6 are natural moments to add them.
- **`useRealtimeSubscription.ts`** carries `'postgres_changes' as never` /
  `callback as never` casts to sidestep channel typing — worth revisiting
  after item 3's type refresh.
- **`modelConfigs.ts`** still wraps its `model_configs` upsert/delete in a
  hand-written structural cast (`supabase as unknown as { from: … }`) — the
  same stale-type escape hatch as item 3, but structural rather than `any`,
  so the item-3 sweep's `no-explicit-any` grep missed it. `model_configs`
  is now in the generated types; the cast can be removed the same way.

## Suggested sequencing

Items 1–3 are small, independent, correctness-flavoured PRs — do them first.
Item 4+5 is one project (form kit) with incremental migration; item 6 follows
it naturally. Items 7–11 are opportunistic — adopt when touching the relevant
files. Item 12 waits for a trigger.
