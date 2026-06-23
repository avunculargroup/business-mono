# Assumptions — On-Chain Indicators

Written from a partial view of the repo (the provided `schema.sql`, `DESIGN_BRIEF.md`, the existing
feature specs, the sibling [`../economic-indicators/`](../economic-indicators/README.md) bundle, and
project memory) and verified API research for mempool.space and Coin Metrics. **Not** written with
sight of `CLAUDE.md`, the agents' code, the live-ticker implementation, or the content pipeline
internals. Everything below is an inference — confirm before/during the relevant session.

Format: **assumed**, **verify**, **impact if wrong**.

-----

## Repository, build & database

Same as the economic-indicators feature — see
[`../economic-indicators/assumptions.md`](../economic-indicators/assumptions.md) for the full
detail on monorepo layout (`apps/web`, `apps/agents`), TypeScript, Supabase Postgres, the
hand-applied `schema.sql` convention vs a migrations tool, and the reuse of `update_updated_at()`,
`team_members`, and the authenticated-all RLS pattern. The same caveats apply verbatim. On-chain-specific
additions below.

**Apply order: table DDL → `sql/views.sql` → `sql/seed.sql`.** `v_onchain_dashboard` depends on
`v_hash_ribbons`, so the views file drops and recreates in dependency order (dashboard → ribbons →
series, then rebuilds series → ribbons → dashboard).
*Verify:* the tables exist before the views run.
*If wrong (out of order):* the dependent view errors; harmless, re-run in order.

**Postgres supports window functions, `FILTER`, and `PERCENTILE`-free aggregation.** The views use
`ROW_NUMBER`, windowed `AVG`/`COUNT`, and `FILTER (WHERE ...)` — all standard on Supabase Postgres.
*If wrong:* extremely unlikely on a modern Postgres.

-----

## Agent framework & scheduling

**A daily scheduler exists and this poll can ride it.** Assumed the same scheduled Mastra workflow
that runs the macro sweep / compliance check can host (or sit beside) this one.
*Verify:* the actual Railway cron/trigger and whether to extend the existing sweep or add a schedule.
*If wrong:* you must stand up the trigger before unattended polling works.

**Mastra workflow/step signatures are design-level only.** Verify against the installed version via
the `mastra` skill. Adapters are framework-agnostic and unaffected.

-----

## External data providers

**mempool.space — free, no key, field names confirmed.** `currentHashrate`, `difficultyChange`,
pool `share`, and `reward-stats` `totalReward`/`totalFee` were confirmed against live docs.
*Verify at build:* the `reward-stats` block-count window you pick to approximate a day, and the
sats→BTC convention for the miner fee/revenue inputs.
*If wrong:* `fee_share` is scaled oddly; caught immediately by the fixture test.

**Hash rate must be normalised to EH/s in the adapter.** Raw H/s (~6e20) exceeds
`Number.MAX_SAFE_INTEGER` (~9e15) and loses precision as a JS `number`. The adapter divides by 1e18.
*Verify:* the fixture test asserts a normalised value (~640, not 6.4e20).
*If wrong:* the hash-rate series and its Hash-Ribbons MAs are silently corrupted — the single most
important normalisation in this feature.

**Coin Metrics community — free, no key, ~1.6 req/s, metrics batched in one call.** Confirmed the
community tier needs no key and is rate-limited to 10 requests per 6 seconds. The metric ids
`CapMVRVCur`, `CapRealUSD`, `SplyCur`, `AdrActCnt` are standard Coin Metrics codes.
*Verify:* that **each** of those metrics shows `community: true` in the CM catalog (`/catalog-v2`)
for BTC — community is a *subset* of Network Data Pro, and per-metric availability is the thing to
confirm, not just that the tier exists. MVRV in particular: confirm `CapMVRVCur` is community, else
derive it from `CapMrktCurUSD / CapRealUSD` (both expected in community).
*If wrong:* a metric returns empty for the community tier; fall back to deriving it, or drop the card.

**Coin Metrics serves a same-day flash value that later revises.** Assumed acceptable — take the
flash value and let supersession catch the revision.
*Verify:* whether you'd rather request only `reviewed` values at a lag (Open Question).
*If wrong:* dashboard shows a slightly provisional latest figure that firms up next day — usually fine.

**mempool pool attribution drifts.** Pools rebrand and share coinbase tags, so `pool_concentration_top`
is indicative, not exact.
*If wrong:* the top-pool % is approximate — acceptable for a decentralisation-watch metric, but don't
quote it to the decimal in content.

-----

## Derived-metric model

**Derived metrics are computed in views, never stored.** `fee_share`, `realised_price`, and
`hash_ribbons` have no rows in `onchain_observations`; they live in `views.sql`.
*Verify:* nobody "helpfully" adds a workflow step that writes derived values into observations —
that would defeat the computed-over-stored decision and create drift.

**`derivation_spec` documents intent; the view implements it explicitly.** The JSONB on derived rows
is metadata, not an execution engine — there is no dynamic SQL over it. Adding a derived metric means
adding a registry row *and* a branch in `views.sql`.
*If wrong (someone expects the spec to auto-execute):* the metric silently won't compute — it needs
its explicit view branch.

**The Hash-Ribbons MA window counts rows, not days.** `ROWS BETWEEN N PRECEDING` assumes one
contiguous row per day. A polling gap shortens the effective window.
*Verify:* daily polling is reliable, or switch to a date-ranged window / gap-fill.
*If wrong:* the MAs (and the recovery/capitulation signal) are computed over fewer than 30/60 actual
days after a gap.

**Derived metrics carry NULL day-over-day deltas in v1.** Computing them needs prior derived values
— a deferred extension. Fetched metrics have full deltas.
*If wrong (someone expects derived deltas):* they're simply absent; the card hides a NULL delta, same
as the macro panel hides a not-yet-available YoY.

**First-ingest backfill of ~90 days is needed.** Hash Ribbons needs 60 days of hash rate; deltas need
yesterday. Both providers serve history.
*Verify:* the backfill depth in Session 2.
*If wrong:* Hash Ribbons returns no signal for ~60 days and sparklines are sparse until history accrues.

-----

## Compliance — the on-chain-specific risk

**On-chain valuation metrics are the highest advice-risk content on the platform, and Lex must guard
it.** MVRV, realised price, and Hash Ribbons are legitimate *context* but become a regulatory problem
the instant content frames them as buy/sell signals or price predictions — BTS operates under an
AFSL/AR. This shaped two concrete choices: the MVRV card shows historical-range context, **not** a
cheap/expensive colour, and the Hash-Ribbons chip states what the cross *is*, never what to *do*.
*Verify:* whoever owns compliance signs off on (a) the MVRV band values (`below 1.0 / above 3.5` are
illustrative, not calibrated, not advice) and (b) the framing language used anywhere these metrics
appear in outbound content.
*If wrong:* the platform generates content that reads as personal financial advice — a real
regulatory exposure, not a cosmetic one. Treat this as a hard gate, not a nicety.

**Content beats land in the existing content pipeline (`content_items`) and never auto-publish.**
This feature emits a proposal only.
*Verify:* `content_items.source` has a CHECK constraint — confirm the value used for an
agent-proposed on-chain beat is allowed (e.g. `'content_agent'`), not a new string.
*If wrong:* the insert is rejected by the CHECK.

-----

## Frontend & conventions

**Reuses the economic-indicators card component.** Assumed `apps/web` already has it (or will, from
that feature's Session 3), plus the Playfair/DM Sans/JetBrains Mono fonts and design tokens.
*Verify:* the component exists and can take this data source with a `signal` chip variant added.
*If wrong:* build the card from the prototype reference rather than reusing.

**USD only in v1; AUD deferred.** Realised price/cap are USD. A CFO audience may want AUD via the
existing AUD/USD rate.
*If wrong (AUD wanted now):* small addition reusing the live-ticker FX rate.

**Naming and dates.** `onchain_indicators` / `onchain_observations` assumed not to collide with
existing objects (`\dt` to confirm). `observed_at` is a **UTC calendar date** throughout. Bitcoin
(network) / bitcoin (unit) capitalisation and Australian English apply.
