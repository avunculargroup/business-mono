# Economic Indicators (Macro Series)

Slow-moving macro indicators for the dashboard — money supply, inflation, and the
policy rates that set the opportunity cost of holding cash. The live tickers (BTC,
AUD/USD, gold, bond yields) already exist; this feature adds the slower, higher-signal
layer beneath them, persisted as a time series so it serves both the dashboard and the
agents (Rex citing exact figures, Charlie/Margot triggered by a fresh print).

**Status:** Draft · **Last updated:** 2026-06-20

-----

## Documents in this folder

| File | What it is | Read it when |
|------|-----------|--------------|
| [`feature-spec.md`](./feature-spec.md) | The main spec — data model, views, agent integration, UI, open questions | Start here; before Sessions 1 & 3 |
| [`adapter-contract.md`](./adapter-contract.md) | The ingest seam — the common shape FRED / RBA / ABS each map to | Before Session 2 |
| [`assumptions.md`](./assumptions.md) | What was inferred without full repo context — verify these before building | Before any session |
| [`sql/seed.sql`](./sql/seed.sql) | The six v1 indicators, with FRED codes / RBA table refs and confidence notes | Session 1 |
| [`sql/v_indicator_latest.sql`](./sql/v_indicator_latest.sql) | Canonical `v_indicator_latest` view, with year-on-year join | Session 1 |
| [`prototype/macro-indicators-panel.html`](./prototype/macro-indicators-panel.html) | Faithful design reference for the panel (not product code) | Session 3 |

Referenced from the repo root: [`../../../CLAUDE.md`](../../../CLAUDE.md) (routing),
[`../../../schema.sql`](../../../schema.sql), [`../../../DESIGN_BRIEF.md`](../../../DESIGN_BRIEF.md).

-----

## Build sequence

**Session 1 — data layer.** Add `economic_indicators` and `indicator_observations` to
`schema.sql`, plus indexes, RLS and the `updated_at` trigger. Create `v_indicator_series`
(in the spec) and `v_indicator_latest` (from [`sql/v_indicator_latest.sql`](./sql/v_indicator_latest.sql) —
**not** the YoY-free snippet inline in the spec). Apply [`sql/seed.sql`](./sql/seed.sql).
Stop for review before any agent code.

**Session 2 — ingest workflow.** Read [`adapter-contract.md`](./adapter-contract.md) first.
Build the scheduled Mastra **Workflow** (not an Agent) with one adapter per provider
(`fred`, then `rba`; `abs` deferred), the revision/supersession logic, `agent_activity`
logging, and the content-beat proposal step. Verify Mastra signatures via the `mastra` skill.

**Session 3 — dashboard panel.** Build the local/global card panel against
`v_indicator_latest` and `v_indicator_series`, following
[`../../../DESIGN_BRIEF.md`](../../../DESIGN_BRIEF.md) and the reference render in
[`prototype/`](./prototype/macro-indicators-panel.html). The React-port contract and the
neutral-delta colour rule are in the prototype's header comment.

-----

## Applying the SQL

The `.sql` files here are the reviewed, canonical copies. They are written to run top-to-bottom
in the Supabase SQL editor, matching the existing `schema.sql` convention. **If the project uses
a migrations tool** (e.g. `supabase/migrations/` with timestamped files), copy these into that
mechanism rather than running them ad hoc — see [`assumptions.md`](./assumptions.md), "Database &
migrations". Apply order: table DDL (in `schema.sql`) → `sql/v_indicator_latest.sql` → `sql/seed.sql`.

-----

## The one decision that carries the feature

Deltas are rendered **neutral — never green-up / red-down**. A rising M2 is the BTS thesis,
not a "success"; colouring it green would put the dashboard at odds with the business on its own
screen. Direction is shown by an arrow; gold is reserved for *freshness* (a print released within
~7 days). Success-green and destructive-red stay in compliance and contracts, where up/down
genuinely maps to good/bad. If a reviewer asks to "add colour" to the deltas, that's the rule to
point them at.
