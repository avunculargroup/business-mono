# On-Chain Indicators — Implementation Summary

**Branch:** `claude/onchain-metrics-dashboard-ky1j2g`
**Status:** Implemented across four commits (Sessions 1–4). Not yet merged; no PR opened.
**Date:** 2026-06-21

This records what was built against the drafts in this folder, how it differs from
those drafts, how it was verified, and what is deliberately deferred.

-----

## Headline

The drafted specs assumed the sibling `economic-indicators` feature was only a
design. It is in fact **fully shipped in code**, so this feature was built to
**mirror that proven, in-repo pattern** rather than the spec's standalone design.
The valuable parts of the spec (separate table, fetched-stored vs derived-in-views,
the adapter contract, EH/s normalisation, neutral non-advice UI) were kept; the
integration details that didn't match the real codebase were corrected.

-----

## What was built

### Session 1 — Data layer
`supabase/migrations/20260621170000_add_onchain_indicators.sql`
- `onchain_indicators` registry — display metrics **and** raw inputs, with a
  `fetched`/`derived` discriminator and a CHECK that derived rows carry no
  provider and fetched rows must.
- `onchain_observations` — append/supersede-only, `NUMERIC(24,6)`, UTC
  `observed_at`, vintage uniqueness `(indicator_id, observed_at, ingested_at)`.
- Views: `v_onchain_series`, `v_hash_ribbons` (30/60-day MA + `capitulation`/
  `recovery`/`neutral` signal), `v_onchain_dashboard` (one row per display
  metric; fetched read latest, derived computed inline).
- Seed: 8 display + 5 raw-input rows (idempotent on `key`).
- `schema.sql` reference block + `packages/db/.../database.ts` types added.

### Session 2 — Ingest
`apps/agents/src/lib/onchain/` + `supabase/migrations/20260621170001_add_onchain_poll_routine.sql`
- `mempool` adapter (hash rate **normalised H/s → EH/s**, difficulty,
  difficulty-adjustment, pool concentration, reward-stats **sats → BTC**;
  degrades gracefully when one endpoint fails).
- `coinmetrics` adapter (single batched request; MVRV fetched directly; missing
  metric treated as absent, never zero).
- `runOnchainPoll` — supersession (insert/supersede/no-op, rounded to the column
  scale), ~90-day first-ingest backfill, and alert evaluation against the
  **derived views** (Hash-Ribbons signal change, MVRV band cross, hash-rate drop)
  → **compliance-tagged** content beats for Charlie behind the publish wall,
  deduped per-indicator per week.
- Wired via a new `onchain_poll` routine action through the existing
  `executeRoutineWorkflow` (daily 08:00 AEST) + `@platform/shared` types.

### Session 3 — Dashboard panel
`apps/web/lib/onchain/`, `apps/web/components/dashboard/Onchain*`, `app/(app)/page.tsx`
- A sibling panel reusing the macro card structure and the generic format helpers
  (`formatValue`, `sparklinePath`), grouped into **Network security** and
  **Holder behaviour & valuation**.
- Compliance-shaped treatments: neutral **Hash-Ribbons state chip** (all states
  styled identically — the word carries meaning, never colour or "BUY"),
  **colour-neutral MVRV historical-range marker** (where it sits in its own
  observed history — context, not cheap/expensive), pool-concentration note,
  and an "as at" date on every card.

### Session 4 — Lex, the compliance agent
`supabase/migrations/20260621170002_add_lex_compliance_agent.sql`, `apps/agents/src/agents/compliance/`
- `lex` — a first-class roster persona (added to the `agent_name` CHECK on
  `agent_activity` + `platform_capabilities`) that reviews compliance-sensitive
  drafts for advice framing (buy/sell signals, price predictions) under AFSL/AR.
- Returns a structured `ComplianceVerdict` (passes / flags / rationale /
  suggested_rewrite). `recordComplianceReview` logs it under `lex`, linked to the
  content item — `status='pending'` when flagged so it surfaces at the approval
  wall, `'auto'` when it passes. **Advisory only; fails safe** (a review error
  logs as pending, never a silent pass).
- Hooked into `contentCreatorListener`: after a compliance-sensitive draft is
  persisted, Lex reviews it. Registered in `MODEL_SCOPES` (`lex` +
  `content.compliance_review`) so it's configurable at `/settings/models`.
- Docs: `docs/agents/compliance.md`; `CLAUDE.md` roster updated.
- Deliberately **NOT** on Simon's `agents:` roster (a gate, not a chat
  specialist), but **IS** in the CHECK so verdicts are auditable under its own
  name — the key difference from the internal newsletter `editor`.

-----

## How it differs from the drafted specs

| Drafted spec said | What was built | Why |
|---|---|---|
| Build a standalone scheduled **Mastra Workflow** | A `routines` row + `onchain_poll` action dispatched through the existing `executeRoutineWorkflow`, logic in a `lib/` handler | Matches the already-shipped macro sibling (`runIndicatorPoll`) |
| Add tables to `schema.sql`, run views/seed in the SQL editor | Everything in **migrations** under `supabase/migrations/`; `schema.sql` updated as reference only | Migrations are the execution source of truth (`packages/db/MIGRATIONS.md`) |
| "Lex" / "Margot" flag content | Built **Lex** as a real agent (per your call); "Margot" doesn't exist and was dropped | The roster is fixed by a DB CHECK; we widened it for Lex |
| `sql/seed.sql`, `prototype/` subpaths | Files are flat in this folder; paths normalised | Cosmetic drift in the drafts |

-----

## Verification

- **Migrations** applied cleanly + idempotently on a real Postgres 16; the
  derivation/provider CHECK holds; derived views computed `fee_share`,
  `realised_price`, and all three Hash-Ribbons signal states from synthetic data;
  the `lex` agent_name widening + capability seed verified.
- **Tests** (all green): agents **476** (34 new — adapter parse incl. the EH/s
  normalisation and overflow safety, `runOnchainPoll` supersession/backfill/alert
  + dedupe, compliance verdict mapping + plumbing); web **122** (6 new — grouping,
  neutral chip asserts no BUY/SELL, MVRV range marker, pool note, freshness).
- **Typecheck** clean across `@platform/db`, `@platform/shared`, `@platform/agents`,
  `@platform/web`.
- **Eval** added (`evals/lex-compliance.eval.ts`, not in CI) — run locally with
  `pnpm --filter @platform/agents test:eval` once LLM keys are set.

-----

## Deferred / open items

**Needs a business / compliance decision before driving outbound content**
- **MVRV band values** (`below 1.0 / above 3.5`) are illustrative, not calibrated —
  confirm with whoever owns compliance before they trigger any beat.
- **Lex's enforced framing language** — the advice-vs-context rules should be
  signed off by compliance.

**Deferred by scope (noted in the plan)**
- **AUD conversion** of USD metrics (realised price/cap) — v1 is USD; reuse the
  live-ticker FX rate later.
- **Difficulty-retarget ETA sub-line** — `estimatedRetargetDate` is preserved in
  `onchain_observations.raw` but not surfaced on the card (the dashboard view
  doesn't expose `raw`); a small follow-up.
- **Realised price "alongside spot"** — shown as USD fact; pairing with live spot
  is deferred.
- **The paid frontier** (SOPR, NUPL, LTH supply, exchange net flows) — out of v1.

**Operational confirmations at deploy**
- Confirm each Coin Metrics metric is `community:true` in the live catalog
  (MVRV fallback = `CapMrktCurUSD / CapRealUSD`).
- Pick/confirm the mempool `reward-stats` block-count window (currently 144 ≈ 1 day).
- Generated `database.ts` types were hand-edited to the generator's shape (no DB
  credentials in this environment); regenerate with `pnpm db:generate-types`
  against the real project post-merge.

**Possible follow-ups**
- Surface Lex's verdict inline in the content review UI (today it's an
  `agent_activity` row — the approval/audit substrate).
- Derived-metric day-over-day deltas (NULL in v1).
- Hash-Ribbons MA window is row-based (assumes daily-contiguous rows); switch to a
  date-ranged window or gap-fill if polling ever misses days.

-----

## Key paths

- Migrations: `supabase/migrations/2026062117000{0,1,2}_*.sql`
- Ingest: `apps/agents/src/lib/onchain/` ; workflow wiring in `apps/agents/src/workflows/executeRoutineWorkflow.ts`
- Compliance: `apps/agents/src/agents/compliance/` ; `docs/agents/compliance.md`
- Dashboard: `apps/web/lib/onchain/format.ts`, `apps/web/components/dashboard/Onchain*`, `apps/web/app/(app)/page.tsx`
- Shared: `packages/shared/src/{routines,modelScopes}.ts`
