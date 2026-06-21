# On-Chain Indicators

Bitcoin network and on-chain metrics for the dashboard — mining security and holder behaviour,
the evidence only Bitcoin can offer about its own credibility as a treasury asset. A sibling of
[`../economic-indicators/`](../economic-indicators/README.md): same scheduled-poll-and-snapshot
pattern, same dashboard card, but a separate table because on-chain data is shaped differently
(daily not quarterly, no period-vs-release gap, and several metrics derived from others).

**Status:** Draft · **Last updated:** 2026-06-21

-----

## The eight display metrics

**Network security:** hash rate (7d) · next difficulty adjustment · Hash Ribbons · fee share of
miner revenue · top mining-pool share.
**Holder behaviour & valuation:** MVRV · realised price · active addresses.

All free, from two keyless providers: **mempool.space** (mining, fees, pools, difficulty) and
**Coin Metrics community** (MVRV, realised cap, supply, active addresses).

-----

## Documents in this folder

| File | What it is | Read it when |
|------|-----------|--------------|
| [`feature-spec.md`](./feature-spec.md) | Main spec — data model, fetched-vs-derived, views, agents, UI, open questions | Start here; before Sessions 1 & 3 |
| [`adapter-contract.md`](./adapter-contract.md) | The ingest seam — the shape mempool.space and Coin Metrics map to | Before Session 2 |
| [`assumptions.md`](./assumptions.md) | What was inferred without full repo context — verify before building | Before any session |
| [`sql/seed.sql`](./sql/seed.sql) | The registry rows — 8 display metrics + the raw inputs feeding derived ones | Session 1 |
| [`sql/views.sql`](./sql/views.sql) | `v_onchain_series`, `v_hash_ribbons`, `v_onchain_dashboard` (derivation lives here) | Session 1 |

Repo root: [`../../../CLAUDE.md`](../../../CLAUDE.md) · [`../../../schema.sql`](../../../schema.sql) ·
[`../../../DESIGN_BRIEF.md`](../../../DESIGN_BRIEF.md).
Dashboard component reference: [`../economic-indicators/prototype/macro-indicators-panel.html`](../economic-indicators/prototype/macro-indicators-panel.html).

-----

## Build sequence

**Session 1 — data layer.** Add `onchain_indicators` and `onchain_observations` to `schema.sql`
(indexes, RLS, trigger). Apply [`sql/views.sql`](./sql/views.sql) then [`sql/seed.sql`](./sql/seed.sql).
Stop for review before agent code.

**Session 2 — ingest workflow.** Read [`adapter-contract.md`](./adapter-contract.md) first. Build
the scheduled Mastra **Workflow** with two adapters (`mempool`; `coinmetrics`, which batches all its
metrics in one request), supersession logic, derived-view-driven alert evaluation, `agent_activity`
logging, and the publish-wall content-beat proposal. Verify Mastra signatures via the `mastra` skill.

**Session 3 — dashboard panel.** Reuse the economic-indicators card against `v_onchain_dashboard`,
two groups. Apply the MVRV range-not-colour treatment and the Hash-Ribbons neutral state chip — read
the UI section and the Lex compliance note first.

-----

## Applying the SQL

Reviewed canonical copies, written to run in the Supabase SQL editor in the existing `schema.sql`
style. **Apply order:** table DDL (in `schema.sql`) → [`sql/views.sql`](./sql/views.sql) →
[`sql/seed.sql`](./sql/seed.sql). If the project uses a migrations tool, copy these in rather than
running ad hoc — see [`assumptions.md`](./assumptions.md).

-----

## The decisions that carry the feature

1. **Fetched is stored; derived is computed.** `onchain_observations` holds only raw fetched series;
   `fee_share`, `realised_price`, and Hash Ribbons are computed in `views.sql`, never stored. MVRV is
   fetched directly (don't recompute what Coin Metrics publishes well). Honours computed-over-stored
   and keeps raw observations pure.

2. **Hash rate is normalised to EH/s in the adapter.** Raw H/s overflows a JS float and loses
   precision. This is the one normalisation that, if missed, silently corrupts the hash-rate series
   and its Hash-Ribbons signal.

3. **Neutral, non-advice display — with teeth here.** Same neutral-delta rule as the macro panel,
   but on-chain valuation metrics are the platform's highest advice-risk surface. MVRV shows
   historical-range context, never cheap/expensive colour; Hash Ribbons states what the cross *is*,
   never what to *do*. Lex flags any content that frames these as buy/sell. This is a compliance gate,
   not a style preference — BTS operates under an AFSL/AR.
