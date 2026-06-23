# Feature Spec — On-Chain Indicators

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Bitcoin network & on-chain metrics — registry, observations, derived signals, agent monitoring
**Status:** Draft
**Last updated:** 2026-06-21

**In this feature folder:** [`README.md`](./README.md) · [`adapter-contract.md`](./adapter-contract.md) · [`assumptions.md`](./assumptions.md) · [`sql/seed.sql`](./sql/seed.sql) · [`sql/views.sql`](./sql/views.sql)
**Sibling feature:** [`../economic-indicators/`](../economic-indicators/README.md) — shares design language, the scheduled-poll pattern, and the dashboard card component.

-----

## Overview

The economic indicators answer *what is happening to money and rates*. This feature answers
the question only Bitcoin can answer about itself: *how healthy and secure is the network, and
what are holders actually doing on-chain*. For a firm whose pitch rests on Bitcoin's credibility
as a treasury asset, network security (hash rate, miner economics, decentralisation) and holder
behaviour (cost basis, valuation context, usage) are first-order evidence — not chart-candy.

Eight display metrics, in two groups:

**Network security**
- Network hash rate (7-day) + trend
- Next difficulty adjustment (forward estimate)
- Hash Ribbons (miner capitulation / recovery signal)
- Fee share of miner revenue (the security-budget-transition story)
- Mining pool concentration (decentralisation risk)

**Holder behaviour & valuation**
- MVRV ratio (valuation vs the network's cost basis)
- Realised price (the network's aggregate cost basis)
- Active addresses (usage / adoption)

Like the macro layer, these are **slow but high-signal** — daily resolution, not tickers — and
ride the same scheduled-poll-and-snapshot architecture so the data is both a dashboard surface
and agent fuel (Rex citing exact figures, Charlie/Margot triggered by a hash-ribbon recovery or
an MVRV regime change — always behind the publish wall).

-----

## Why a separate table (and what changes because of it)

Folding this into `economic_indicators` would force two different data shapes through one model.
On-chain data differs in three ways that matter:

1. **No period-vs-release gap.** A macro print refers to a past quarter and publishes weeks
   later — the period/release distinction was load-bearing there. On-chain metrics are *same-day*:
   the value for 20 June is computed from 20 June's blocks and available that day. So this feature
   uses a single `observed_at` and drops the period/release split entirely. Less machinery, honestly.
2. **Several metrics are *derived* from others.** Fee share = fees ÷ revenue; realised price =
   realised cap ÷ supply; Hash Ribbons = moving-average cross of hash rate. Macro indicators were
   all directly fetched. This feature needs first-class support for derived indicators.
3. **Different providers and cadence** — mempool.space and Coin Metrics, daily, both keyless.

So: a sibling `onchain_indicators` registry + `onchain_observations` table, sharing the
*patterns* of the macro feature (registry + observations, supersession for revisions, computed
deltas, neutral dashboard treatment) without inheriting machinery it doesn't need.

-----

## Scope

### In scope

- `onchain_indicators` registry — display metrics **and** the raw input series that feed derived ones
- `onchain_observations` — raw fetched values only (see the storage decision below)
- A scheduled Mastra **Workflow** polling two providers (mempool.space, Coin Metrics community)
- **Derived metrics computed in views, never stored** — fee share, realised price, Hash Ribbons
- Agent-readable views for Simon's monitoring and Rex's research, plus a compliance note for Lex
- Dashboard cards reusing the economic-indicators component, regrouped for on-chain

### Out of scope

- The four paid-frontier behaviour metrics — SOPR, NUPL, long-term-holder supply, exchange net
  flows — which need a paid provider or a node + analytics (flagged in Open Questions)
- AUD conversion of USD-denominated metrics (realised price/cap) — v1 is USD; reuse the existing
  FX rate later
- Per-block / intraday resolution — daily snapshots only
- The content generation itself — this feature emits the trigger; drafting lives in the content pipeline

### The storage decision: fetched is stored, derived is computed

`onchain_observations` holds **only raw fetched series** (hash rate, difficulty, miner fees,
miner revenue, realised cap, supply, active addresses, pool shares, MVRV). The derived display
metrics are computed in [`sql/views.sql`](./sql/views.sql), not stored:

- **fee_share** = `miner_fees ÷ miner_revenue` — a same-day division
- **realised_price** = `realised_cap ÷ supply` — a same-day division
- **hash_ribbons** = 30-day vs 60-day MA of hash rate + cross state — a window over the series

This honours the platform's *computed-over-stored* principle: raw observations stay pure truth,
and a formula change (or a corrected input) re-derives history for free instead of leaving stale
stored values. **MVRV is fetched directly** from Coin Metrics (it computes it canonically), so it
is `fetched`, not derived — don't recompute what the provider already publishes well.

The registry marks each row `fetched` or `derived` so the UI and agents treat all display metrics
uniformly regardless of where the number comes from.

-----

## User Stories

**As a founder, I need to:**

- See a single on-chain panel — network security on one side, holder behaviour on the other —
  each card showing the latest value, how it moved, and when it was observed
- Be told when the Hash Ribbons signal flips to recovery, or MVRV enters a historical extreme,
  without watching charts
- Trust that a "valuation" metric on our own dashboard is framed as *context*, never as a buy/sell
  call — we operate under an AFSL/AR and this is exactly where content drifts into advice
- Add or pause an indicator from the registry without code changes

**As Simon (coordinator agent), I need to:**

- Poll both providers daily, store raw observations, and let the views derive the rest
- Query `v_onchain_dashboard` for fresh values and notable moves / signal changes
- Propose a content beat (behind the publish wall) on a Hash-Ribbons recovery, a large hash-rate
  drop, an MVRV regime change, or a fee-share spike
- Log every poll outcome to `agent_activity`

**As Lex (compliance agent), I need to:**

- Flag any content that frames MVRV, realised price, or Hash Ribbons as a recommendation to buy
  or sell — these metrics are the single most likely place on the platform for on-chain commentary
  to cross into personal financial advice

**As Rex (researcher), I need to:**

- Read the observation history and derived views to cite exact figures with their `observed_at`

-----

## Data Model

### `onchain_indicators`

One row per indicator — display metrics and the raw inputs that feed derived ones.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `key` | TEXT UNIQUE | Stable slug, e.g. `hash_rate`, `fee_share`. Derived rows reference inputs by key |
| `name` | TEXT | Display name |
| `short_label` | TEXT | Compact card label |
| `metric_group` | TEXT | `network_security`, `behaviour_valuation` |
| `derivation` | TEXT | `fetched` (pulled from a provider) or `derived` (computed in a view) |
| `provider` | TEXT | `mempool`, `coinmetrics` — NULL for derived |
| `provider_metric_code` | TEXT | Provider's metric/endpoint key, e.g. CM `CapRealUSD`. NULL for derived |
| `derivation_spec` | JSONB | For derived rows: documents the formula and input keys (see below). `'{}'` for fetched |
| `unit` | TEXT | `eh_s`, `ratio`, `usd`, `percent`, `count`, `signal` |
| `decimals` | INT | Display precision. Default `2` |
| `poll_frequency` | TEXT | Operational config — `daily` for all v1 |
| `is_displayed` | BOOLEAN | `true` for the 8 headline metrics; `false` for raw inputs that only feed derived ones |
| `alert_config` | JSONB | What proposes a beat (see below). `'{}'` = no alert |
| `is_active` | BOOLEAN | `true` polls; pausing keeps history |
| `notes` | TEXT | Provider quirks, confidence |
| `created_by` | UUID | FK → `team_members` |
| `created_at` / `updated_at` | TIMESTAMPTZ | `updated_at` auto-updated |

**`derivation_spec` shape (derived rows only):**

```json
{ "type": "ratio",       "numerator_key": "miner_fees_total", "denominator_key": "miner_revenue_total", "as_percent": true }
{ "type": "ratio",       "numerator_key": "realised_cap",     "denominator_key": "supply" }
{ "type": "hash_ribbons","source_key": "hash_rate",           "fast_days": 30, "slow_days": 60 }
```

> `derivation_spec` **documents intent**; the view implements each formula explicitly (no dynamic
> SQL over JSONB). If you add a derived metric, you add a row here *and* a branch in `views.sql`.
> That's the honest trade — readable SQL over a clever generic engine for three formulas.

**`alert_config` shape:**

```json
{ "on_signal_change": true }                         // hash_ribbons
{ "bands": [{ "below": 1.0 }, { "above": 3.5 }] }    // mvrv — historical extremes, NOT advice
{ "drop_pct_over_days": { "pct": 10, "days": 14 } }  // hash_rate — miner-stress watch
```

Bands are configurable context thresholds, **not** recommendations. See the compliance note under
Agent Integration before wiring any of these to content.

### `onchain_observations`

Raw fetched values only. One row per (indicator, day, vintage).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `indicator_id` | UUID | FK → `onchain_indicators` ON DELETE CASCADE |
| `observed_at` | DATE | The day the value pertains to (= the day it was computed from chain data) |
| `value` | NUMERIC(24,6) | Wide enough for realised cap (USD, ~1e12) and precise enough for ratios |
| `is_current` | BOOLEAN | Latest vintage for this `observed_at`. Revisions flip prior rows false |
| `is_revision` | BOOLEAN | Supersedes an earlier value for the same day |
| `superseded_value` | NUMERIC(24,6) | The prior value a revision replaced |
| `source` | TEXT | `mempool`, `coinmetrics` — provenance |
| `raw` | JSONB | The provider payload slice, for audit / re-parse. Default `'{}'` |
| `ingested_at` | TIMESTAMPTZ | When we fetched it. Default `NOW()` |
| `created_at` | TIMESTAMPTZ | |

**Revision handling — same supersession pattern as the macro feature, lighter in practice.**
On-chain daily data revises rarely: Coin Metrics serves a *flash* value that may later be
*reviewed/revised*, and a block reorg can nudge a same-day figure. Uniqueness on
`(indicator_id, observed_at, ingested_at)`; on ingest, if the value for an existing `observed_at`
differs, insert a new current row and flip the prior to `is_current = false`. Unchanged → no-op.
Hash rate is stored in **EH/s** (the adapter normalises down from raw H/s — see the adapter
contract for why raw H/s overflows a JS float).

-----

## Database Views

Full SQL in [`sql/views.sql`](./sql/views.sql). Three views:

- **`v_onchain_series`** — current fetched observations per indicator, ordered, for sparklines.
- **`v_onchain_dashboard`** — the panel's source. One row per **display** metric (fetched *and*
  derived), uniform shape: `key, name, short_label, metric_group, unit, decimals, value,
  observed_at, change_since_prior, pct_change_since_prior, days_since_observed, signal`. Fetched
  metrics read their latest current observation; derived metrics are computed inline (fee share
  and realised price by pivoting the input keys; Hash Ribbons from a windowed MA sub-select).
- **`v_hash_ribbons`** — the 30/60-day MAs, the spread, and the signal state (`capitulation`,
  `recovery`, `neutral`), surfaced separately because the agent watches the *cross transition*,
  not just the latest state.

> **Caveat baked into the view:** the MA windows use `ROWS BETWEEN N PRECEDING`, which assumes
> daily-contiguous rows. A gap in polling would shorten the effective window. For v1 with reliable
> daily polling this is fine; if gaps appear, switch to a date-ranged window or gap-fill. Flagged
> in `views.sql` and in Open Questions.

-----

## Agent Integration

### This is a Workflow, not an Agent

Fetch → store raw → let views derive → check alert config → maybe propose. Deterministic; a
**Mastra Workflow**. Read [`adapter-contract.md`](./adapter-contract.md) before Session 2 and
verify Mastra signatures via the `mastra` skill.

### Simon — scheduled poll

Daily (suggest alongside the macro sweep / compliance check, AEST morning). Per active indicator
due per `poll_frequency`:

1. Fetch via the provider adapter (`mempool` or `coinmetrics`). Coin Metrics metrics are batched
   into **one** request (comma-separated), so all CM-sourced indicators cost a single call.
2. Diff against the current observation for that `observed_at`; insert / supersede / no-op.
3. After all fetched rows are in, evaluate `alert_config` against the derived views (e.g. did
   `v_hash_ribbons.signal` change since yesterday; did MVRV cross a band).
4. On a fired alert, propose a content beat as a **pending** action behind the publish wall, and
   add a line to Simon's digest.
5. Log every outcome to `agent_activity` (`trigger_type: 'scheduled'`), including no-ops.

**Example digest line:**

```
On-chain — 1 signal change:

Hash Ribbons flipped to RECOVERY (30d MA crossed above 60d) — miner capitulation easing.
MVRV 2.1 (neutral range). Hash rate 642 EH/s, +1.8% on the week.
Drafted a beat. Reply to review.
```

### Lex — the compliance guardrail that matters here

On-chain valuation metrics are the **highest advice-risk content on the platform**. "MVRV says
bitcoin is undervalued" is, to a regulator, a securities-style buy signal dressed as analysis —
and BTS operates under an AFSL/AR. Lex must flag any drafted content that frames MVRV, realised
price, or Hash Ribbons as a reason to buy or sell, or as a price prediction. The metrics are
legitimate *context* ("bitcoin trades above the network's aggregate cost basis"); they become a
problem the moment they're framed as a recommendation. This guardrail is a hard requirement, not
a nicety, and it shapes the dashboard treatment below.

### Rex — research and citation

Reads `v_onchain_series` and `v_onchain_dashboard` to cite exact figures with `observed_at`.
External sources stay supplementary; the stored observation is the citable number.

-----

## UI — Dashboard Treatment

Reuses the economic-indicators card component and design language — mono numerals, neutral
deltas, gold reserved for freshness, generous whitespace. See
[`../economic-indicators/prototype/macro-indicators-panel.html`](../economic-indicators/prototype/macro-indicators-panel.html)
for the reference render and the React-port contract; this panel is the same component with a
different data source and two groups: **Network security** and **Holder behaviour & valuation**.

On-chain-specific treatment:

- **Hash rate** in `EH/s`, mono. Weekly change as a neutral delta.
- **Next difficulty adjustment** shown as the forward estimate (e.g. `+2.4%`) with the retarget
  ETA as the "as at"-style sub-line — it's a projection, so label it as one.
- **Hash Ribbons** as a neutral state chip — `recovery` / `capitulation` / `neutral` — **not**
  "BUY". The chip states what the cross *is*, not what to *do*.
- **MVRV** with **historical-range context, not a cheap/expensive colour.** Show where it sits in
  its own history (a subtle range marker), never green-for-cheap / red-for-expensive. That would
  both violate the neutral-delta rule *and* hand Lex an advice problem. This is the same
  colour-semantics decision as the macro panel, with extra teeth here because of the compliance
  exposure.
- **Realised price** in USD, mono, alongside spot for the "above/below aggregate cost basis"
  framing — stated as fact, not as a signal.
- **Pool concentration** as the top-pool share `%`, with a quiet note if the top one or two exceed
  a decentralisation threshold.

The honesty rule from the macro panel carries over: every card shows `observed_at` ("as at 20 Jun")
so nothing pretends to be live.

-----

## Indexes

```sql
CREATE INDEX idx_onchain_obs_indicator ON onchain_observations(indicator_id);
CREATE INDEX idx_onchain_obs_observed  ON onchain_observations(indicator_id, observed_at DESC);
CREATE INDEX idx_onchain_obs_current   ON onchain_observations(indicator_id, is_current) WHERE is_current = true;
CREATE UNIQUE INDEX uq_onchain_obs_vintage ON onchain_observations(indicator_id, observed_at, ingested_at);

CREATE INDEX idx_onchain_indicators_group     ON onchain_indicators(metric_group);
CREATE INDEX idx_onchain_indicators_active    ON onchain_indicators(is_active) WHERE is_active = true;
CREATE INDEX idx_onchain_indicators_displayed ON onchain_indicators(is_displayed) WHERE is_displayed = true;
```

-----

## RLS Policies

```sql
ALTER TABLE onchain_indicators   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onchain_indicators_all" ON onchain_indicators
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE onchain_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onchain_observations_all" ON onchain_observations
  FOR ALL USING (auth.role() = 'authenticated');
```

-----

## Triggers

```sql
CREATE TRIGGER onchain_indicators_updated_at
  BEFORE UPDATE ON onchain_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

`onchain_observations` is append/supersede-only — no `updated_at`, which keeps it a clean audit trail.

-----

## Open Questions

- **The paid frontier.** SOPR, NUPL, long-term-holder supply, and exchange net flows are
  deliberately out of v1 — none is cleanly free. If one becomes a must-have, exchange net flows is
  the one people pay for (it needs labelled-address data); the others have rough free proxies.
  Decide before committing to a paid provider.
- **MA window gaps.** The Hash Ribbons window assumes daily-contiguous rows. Decide whether to
  gap-fill or switch to a date-ranged window if polling ever misses days.
- **Coin Metrics flash vs revised.** Accept the same-day *flash* value (and let supersession
  catch the revision), or request only *reviewed* values at a lag? Flash is timelier; revised is
  cleaner. Recommend flash for v1.
- **AUD conversion.** Realised price/cap are USD. A CFO audience may want AUD. Reuse the existing
  AUD/USD rate from the live tickers — deferred to keep v1 simple.
- **Pool concentration source stability.** mempool.space pool attribution shifts as pools rebrand /
  share coinbase tags. Treat the top-share number as indicative, not exact.
- **MVRV band values.** The `below 1.0 / above 3.5` bands are illustrative historical extremes,
  not advice and not calibrated here. Confirm the band values (and their framing) with whoever
  owns compliance before they drive any content.

-----

## Claude Code Kickoff

> Read [`../../../CLAUDE.md`](../../../CLAUDE.md), this spec, and [`../../../schema.sql`](../../../schema.sql)
> first. Read [`assumptions.md`](./assumptions.md) for what was inferred without full repo context,
> and [`adapter-contract.md`](./adapter-contract.md) before Session 2. The sibling
> [`../economic-indicators/`](../economic-indicators/README.md) feature established the patterns this
> one reuses — read its README if unfamiliar. Verify Mastra signatures via the `mastra` skill.
>
> **Session 1 — data layer.** Add `onchain_indicators` and `onchain_observations` to `schema.sql`
> (indexes, RLS, trigger). Apply [`sql/views.sql`](./sql/views.sql) and [`sql/seed.sql`](./sql/seed.sql).
> Stop for review before agent code.
>
> **Session 2 — ingest workflow.** Read [`adapter-contract.md`](./adapter-contract.md). Build the
> scheduled Mastra Workflow with two adapters (`mempool`, `coinmetrics` — the latter batches all its
> metrics in one call), supersession logic, derived-view-driven alert evaluation, `agent_activity`
> logging, and the publish-wall content-beat proposal. Workflow, not Agent.
>
> **Session 3 — dashboard panel.** Reuse the economic-indicators card component against
> `v_onchain_dashboard`. Two groups (network security / behaviour & valuation). Apply the MVRV
> historical-range-not-colour treatment and the Hash-Ribbons neutral state chip — re-read the UI
> section and the Lex compliance note before styling anything that could read as a buy/sell cue.
