# Assumptions — Economic Indicators

These specs were written from a partial view of the repo: the provided `schema.sql`,
`DESIGN_BRIEF.md`, the Company and Contracts feature specs, and project memory. They were
**not** written with sight of `CLAUDE.md`, the agents' existing code, the live-ticker
implementation, the content pipeline internals, or the actual monorepo layout. Everything
below is therefore an inference. Confirm each before or during the relevant build session —
most are cheap to check and cheap to fix, but a few (the external providers especially) are
where real build time hides.

Format per item: **what was assumed**, **how to verify**, **impact if wrong**.

-----

## Repository structure & build

**Monorepo with npm workspaces.** Assumed `apps/web` (Next.js on Vercel), `apps/agents`
(Mastra on Railway), and shared `packages/*`, per memory. Provider adapters were placed at
`apps/agents/.../adapters/` in the contract.
*Verify:* the actual workspace names and where Mastra workflows/tools live.
*If wrong:* adapter file paths in `adapter-contract.md` shift; nothing structural changes.

**TypeScript throughout.** The adapter contract is written as TS interfaces.
*Verify:* trivially true if `apps/agents` is TS.
*If wrong:* unlikely; would only affect syntax of the contract.

-----

## Database & migrations

**Supabase Postgres; `schema.sql` at repo root, applied top-to-bottom in the SQL editor.**
New table DDL is assumed to be appended to `schema.sql` the way the existing tables are, and
the two `.sql` files here are written to run in that same editor, in order.
*Verify:* whether the project uses a migrations tool (`supabase/migrations/` with timestamped
files) instead of a single hand-applied `schema.sql`.
*If wrong:* the SQL content is unchanged, but the files must be copied into the migration
mechanism and renamed to its convention rather than run ad hoc. See README, "Applying the SQL".

**Apply order: table DDL → `v_indicator_latest.sql` → `seed.sql`.** Views depend on the tables;
the seed depends on `economic_indicators` existing.
*Verify:* nothing else — just respect the order.
*If wrong (out of order):* the view or seed errors out; harmless, re-run in order.

**`DROP VIEW IF EXISTS v_indicator_latest` is safe.** Assumed nothing depends on this view
(`v_indicator_series` is independent).
*Verify:* `grep` for `v_indicator_latest` across any other views/functions added later.
*If wrong:* the DROP fails on a dependency; switch to a dependency-aware migration.

**Postgres version supports `PERCENTILE_CONT … WITHIN GROUP` and `date - INTERVAL`.** True for
any modern Supabase Postgres. The day-gap is cast to `double precision` defensively for
`PERCENTILE_CONT`.
*Verify:* run the `v_indicator_latest` sanity query after seeding.
*If wrong:* swap the median for `AVG(gap)`; less robust to an irregular first gap, but fine.

-----

## Existing schema reuse

**`update_updated_at()` already exists** (it's defined in the provided `schema.sql`) and the new
`economic_indicators` trigger reuses it.
*Verify:* the new DDL runs after that function is defined.
*If wrong:* trigger creation errors; ensure function-before-trigger ordering.

**`team_members` exists; `created_by` is nullable.** The seed leaves `created_by` NULL.
*Verify:* if you want provenance on seeded rows, a `team_members` row must exist to point at
(the seed comment shows the subquery).
*If wrong:* nothing breaks; rows just have no creator.

**`agent_activity` is the audit sink and accepts the new usage without schema change.** Assumed
`agent_name` (free TEXT) accepts `'simon'`, `action` (free TEXT) accepts values like `'polled'` /
`'proposed'`, and `trigger_type` accepts `'scheduled'` (it does — the CHECK includes it).
*Verify:* re-read the `agent_activity` CHECK constraints before the first insert.
*If wrong:* a CHECK rejects an insert; widen the constraint or use an allowed value.

**RLS: the authenticated-all policy pattern is acceptable** for the two new tables, matching the
two-person model used everywhere else.
*Verify:* still appropriate if these are ever surfaced publicly (then add a read-only public
SELECT scoped to `is_current = true`, as flagged in the spec).

-----

## Agent framework & scheduling (Mastra)

**Workflow/step API shapes are design-level only.** The contract describes structure, not exact
Mastra signatures.
*Verify:* read the `mastra` skill and check `createWorkflow` / `createStep` / error handling
against the **installed** version — APIs change between releases.
*If wrong:* the orchestration code needs adjusting; the framework-agnostic adapters don't.

**A scheduler already exists.** The Company/Compliance spec posits a daily 08:00 AEST scheduled
Mastra workflow; this poll is assumed to run inside or beside it.
*Verify:* the actual cron/trigger mechanism on Railway and whether to extend the compliance
sweep or run a separate schedule.
*If wrong:* you need to stand up the scheduling trigger before the poll can run unattended.

**No suspend/resume needed in ingest.** The poll is deterministic; the only human gate is later,
when a proposed content beat is reviewed (handled by the content pipeline, not here).

-----

## External data providers — the real risk area

**FRED.** Assumed an API key exists as an env var in the current secrets setup, the JSON
`series/observations` endpoint shape as described, and the default rate limit (~120/min) is
ample. Series codes `FEDFUNDS`, `M2SL`, `CPIAUCSL` are stable identifiers but **unverified
against the live API**. Values arrive as strings with `"."` for missing — handled in the contract.
*Verify:* one live call per series at build; confirm the env var name.
*If wrong:* a 404 on a code, or an auth error — both obvious and quick to fix.

**RBA.** No API — CSV statistical tables fetched by URL. The file names (`f1.1-data.csv`,
`d3-data.csv`) and, critically, the **exact column header/mnemonic** for the cash-rate-target and
broad-money columns are **guessed**. The adapter selects columns by label, not index, precisely
because this is uncertain.
*Verify:* fetch each CSV live, inspect the preamble offset and the column labels, before writing
the parser. This is where Session 2's hours go.
*If wrong:* the adapter selects the wrong column or fails to find it; caught immediately by the
fixture test.

**ABS — deferred.** `AU CPI` is seeded `is_active = false`. The dataflow id `'CPI'` and the
SDMX-JSON response shape are best guesses. The FRED OECD mirror `AUSCPIALLQINMEI` is the documented
escape hatch.
*Verify:* only when you decide to activate AU CPI.
*If wrong:* contained — the row is inert until an adapter exists.

**`released_at` is null from every provider in v1; the workflow substitutes the fetch date.**
Assumed acceptable for v1 (ALFRED real vintages deferred).
*If wrong:* if you need true publication dates sooner, the FRED adapter populates `releasedAt`
via ALFRED `realtime_*` params — no contract change.

**First-ingest backfill window (12–24 periods) is desirable but undecided.** YoY needs ~12 months
of history to produce a number.
*Verify:* decide the backfill depth in Session 2 (flagged in the adapter contract's open questions).
*If wrong:* without backfill, `yoy_change` / `yoy_pct_change` stay NULL for ~a year — the panel
shows change-since-prior in the meantime, which is correct, just less rich.

-----

## Frontend & design system

**`apps/web` already loads Playfair Display, DM Sans, JetBrains Mono and the `DESIGN_BRIEF`
tokens.** The prototype's CDN `@import` of those fonts is **for standalone rendering only** and
must not be duplicated in-app.
*Verify:* the app's existing font setup before porting.
*If wrong:* double-loaded fonts; harmless but wasteful — and the reason this is called out.

**The card implies a future detail/chart route.** Cards are focusable/clickable in the prototype.
No detail view is specced.
*Verify:* whether a per-indicator detail/chart page is wanted in v1.
*If wrong:* either drop the affordance or add the route — out of scope as written.

**The app's styling system (Tailwind vs CSS modules vs other) is unknown.** The prototype is plain
CSS as a visual reference, to be re-expressed in whatever the app uses.
*Verify:* match the existing component conventions in `apps/web`.

-----

## Content & notification hand-off

**Proposed content beats land in the existing content pipeline (`content_items`) via its own
path.** This feature emits a *proposal* only and never publishes (publish-wall respected).
*Verify:* `content_items.source` has a CHECK constraint — confirm the value used for an
agent-proposed beat is allowed (e.g. `'content_agent'`), not an arbitrary new string.
*If wrong:* the insert is rejected by the CHECK; use an allowed `source` or widen it.

**Simon's Signal notification reuses the existing scheduled-check path.** This feature does not
wire Signal itself.
*Verify:* the compliance sweep's notification mechanism is reusable as-is.

**Beat de-duplication reuses the `agent_activity` "already flagged this week?" check** from the
compliance sweep, rather than a second mechanism.

-----

## Conventions & naming

- Table names `economic_indicators` / `indicator_observations` and the view names are assumed not
  to collide with existing objects. *Verify:* a quick `\dt` / `\dv` in the DB.
- Australian English, the Bitcoin/bitcoin capitalisation rule, and the CFO-audience tone are
  inherited from the brand docs and applied throughout.
- **Every adapter normalises `period_date` to the first day of the period.** The YoY calendar
  join depends on this; it is a hard convention, not a preference. *If wrong* (an adapter passes
  through a raw end-of-month or `Qn` date): the YoY join silently misses and returns NULL.
