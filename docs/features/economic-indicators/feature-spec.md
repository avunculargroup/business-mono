# Feature Spec — Economic Indicators (Macro Series)

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Slow-moving macro indicators — registry, observation time series, agent monitoring
**Status:** Draft
**Last updated:** 2026-06-20

**In this feature folder:** [`README.md`](./README.md) · [`adapter-contract.md`](./adapter-contract.md) · [`assumptions.md`](./assumptions.md) · [`sql/seed.sql`](./sql/seed.sql) · [`sql/v_indicator_latest.sql`](./sql/v_indicator_latest.sql) · [`prototype/`](./prototype/macro-indicators-panel.html)

-----

## Overview

The live tickers (BTC, AUD/USD, gold, government bond yields) already answer *what is the market doing right now*. This feature answers the slower, higher-signal question that actually underpins the BTS thesis: *what is happening to money itself, and to the policy rates that set the opportunity cost of holding it*.

These are not tickers. A quarterly CPI print or a monthly M2 figure that pretends to update every five seconds is a number wearing a fake moustache. Each indicator here is a **latest print + trend** — a value with a reference period, a release date, and a computed delta — persisted as a time series so it serves two masters:

1. **Humans** — a calm "as at" card on the dashboard, grouped local vs global, that frames the debasement and cost-of-capital story for a CFO audience.
1. **Agents** — a structured, queryable feed. A fresh M2 ATH or an RBA decision is a content trigger for Charlie and Margot, and Rex can cite the move with a real number rather than a vibe.

The persistence is the point. A live ticker rendered and forgotten is eye-candy; a stored observation with a release timestamp is agent fuel.

-----

## Scope

### In scope

- Indicator registry (`economic_indicators`) — one row per tracked series, source-discriminated (FRED / RBA / ABS)
- Observation time series (`indicator_observations`) — agnostic to ingestion path, with revision handling
- A scheduled Mastra **Workflow** (not Agent) that polls each indicator on its own cadence, parses the provider response, and upserts observations
- Computed deltas (MoM, YoY, change-since-prior) and computed expected-next-release — never stored
- Agent-readable views for Simon's monitoring and Rex's research
- Dashboard cards (local / global grouping) consuming the latest-current observation per indicator

### Out of scope

- Live, sub-daily tickers — already built; this feature deliberately does not touch them
- Consensus / forecast data and "surprise vs expectation" scoring — no clean free source; deferred (see Open Questions)
- Charlie/Margot content generation itself — this feature *emits the trigger*; drafting lives in the existing content pipeline
- Direct Signal routing wiring — reuses Simon's existing scheduled-check notification path
- Charting library selection — sparklines are a presentation concern handled in the web app

### Initial indicator set (v1)

| Indicator | Region | Provider | Natural frequency | Why it earns a slot |
|-----------|--------|----------|-------------------|---------------------|
| RBA cash rate target | AU | RBA | per meeting (~8/yr) | The local opportunity-cost anchor for every AUD treasury decision |
| US Fed funds rate | US | FRED | monthly / per FOMC | The global risk-free anchor; drives AUD/USD |
| US M2 money supply | US | FRED | monthly | The iconic debasement chart — on-brand to the point of being a logo |
| AU broad money (M3) | AU | RBA | monthly | The local debasement equivalent — rarely displayed, a genuine differentiator |
| US CPI | US | FRED | monthly | Inflation context, global |
| AU CPI | AU | ABS | quarterly (+ monthly indicator) | Inflation context, local |

-----

## User Stories

**As a founder, I need to:**

- See a single dashboard panel of macro indicators, grouped local and global, each showing its latest value, the period it refers to, when it was released, and how it moved
- Trust that a figure labelled "latest" is genuinely the most recent *and* most-revised value, not a stale fetch
- Add a new indicator to the registry without code changes — pick a provider, give the provider's series code, set a poll cadence
- Have the move recorded as a time series so I can see trend at a glance, not just a point value

**As Simon (coordinator agent), I need to:**

- Run a scheduled poll per indicator at its configured cadence, parse the provider response, and insert a new observation only when a genuinely new (or revised) figure exists
- Query `v_indicator_latest` to surface fresh prints and notable moves
- Log every poll outcome to `agent_activity` so there is an audit trail of what was fetched and when
- Propose a content beat (handed to Charlie/Margot) when a watched series prints a new figure or a configurable threshold is crossed — without ever auto-publishing

**As Rex (researcher), I need to:**

- Read the observation history for any indicator to compute deltas and cite exact figures with their release dates
- Distinguish the reference period from the release date, so a claim about "Q1 inflation" cites the right number even though it was published in Q2

-----

## Data Model

Two tables, mirroring the registry + items pattern already used for news sources and for templates + instances elsewhere: a source-discriminated **registry** and an ingestion-agnostic **observation** table.

### `economic_indicators`

One row per tracked series. The registry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `name` | TEXT | Display name, e.g. `US M2 Money Supply` |
| `short_label` | TEXT | Compact card label, e.g. `US M2` |
| `region` | TEXT | `au`, `us`, `global` — drives local/global grouping |
| `category` | TEXT | `policy_rate`, `money_supply`, `inflation` |
| `provider` | TEXT | `fred`, `rba`, `abs` — the source discriminator |
| `provider_series_code` | TEXT | The provider's own series ID, e.g. FRED `M2SL`, `FEDFUNDS`, `CPIAUCSL` |
| `provider_table_ref` | TEXT | For RBA/ABS where there is no clean series ID — table + column reference, e.g. RBA `D3` |
| `unit` | TEXT | `percent`, `aud_billion`, `index`, `usd_billion` |
| `decimals` | INT | Display precision. Default `2` |
| `poll_frequency` | TEXT | **Operational config** — how often the workflow polls: `daily`, `weekly`. See note. |
| `alert_on_new_print` | BOOLEAN | If `true`, any new observation proposes a content beat. Default `true` |
| `alert_change_threshold` | NUMERIC | Optional. If set, a MoM/period change exceeding this (abs) also flags. NULL = print-only |
| `is_active` | BOOLEAN | Default `true` — paused indicators stop polling without losing history |
| `notes` | TEXT | Internal context, e.g. quirks of the provider feed |
| `created_by` | UUID | FK → `team_members` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

**`poll_frequency` is deliberately stored — and this is a refinement of the "computed > stored for cadence" principle, not a violation of it.** Two different things are easy to conflate here:

- The **natural frequency** of the data (monthly, quarterly) — this is a *property of the series* and is **computed** from observation history, never stored. See `v_indicator_latest.expected_next_release`.
- The **poll cadence** (how often we hit the API) — this is an *operational decision*, not derivable from the data. Hitting FRED daily for a figure that prints monthly is fine and cheap; it no-ops 29 days out of 30. This is config, so it lives in a column.

If that distinction feels wrong to you, it's the first thing to push back on.

### `indicator_observations`

The time series. One row per (indicator, reference period, vintage). Agnostic to which provider delivered it.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `indicator_id` | UUID | FK → `economic_indicators` ON DELETE CASCADE |
| `period_date` | DATE | The reference period the figure pertains to (e.g. `2026-03-01` for March M2 or Q1 CPI) |
| `value` | NUMERIC(18,4) | The figure |
| `released_at` | DATE | When the provider published this value. Distinct from `period_date` |
| `is_current` | BOOLEAN | `true` for the latest vintage of this period. Revisions flip prior rows to `false` |
| `is_revision` | BOOLEAN | `true` if this row supersedes an earlier value for the same `period_date` |
| `superseded_value` | NUMERIC(18,4) | The prior value this revision replaced — for surfacing "revised from X" |
| `source` | TEXT | `fred`, `rba`, `abs`, `manual` — provenance, matching the schema-wide `source` convention |
| `raw` | JSONB | The relevant slice of the provider payload, for debugging and re-parse. Default `'{}'` |
| `created_at` | TIMESTAMPTZ | When *we* ingested it |

**`period_date` vs `released_at` is the single most important distinction in this feature.** AU CPI for Q1 releases in late April; March M2 releases mid-April. Humans browsing trend want `period_date`; agents reasoning about "the latest available figure" and Simon deciding "is this new?" want `released_at`. Conflating them produces citations that are quietly wrong — Rex claiming a "Q1" number that's actually the Q4 print.

**Revision handling — the same supersession pattern you already use** for `compliance_documents` and `contract_templates`. Uniqueness is on `(indicator_id, period_date, released_at)`, so multiple vintages of one period can coexist. On ingest:

1. If no row exists for `(indicator_id, period_date)` → insert, `is_current = true`, `is_revision = false`.
1. If a row exists with a *different* value and a newer `released_at` → insert new row (`is_current = true`, `is_revision = true`, `superseded_value` = the old value), and flip the prior row's `is_current = false`.
1. If the value is unchanged → no-op. (This is the 29-days-out-of-30 case.)

This works uniformly across all three providers. FRED (via ALFRED) can supply historical vintages natively; RBA and ABS have no vintage API, so a revision is simply detected by comparing a re-fetch against the stored current value. Same model, same code path.

-----

## Database Views

### `v_indicator_latest`

The dashboard panel and Simon both read this. One row per indicator: its current value, computed deltas, and a computed expected-next-release. Nothing here is stored.

> **Canonical definition:** [`sql/v_indicator_latest.sql`](./sql/v_indicator_latest.sql). That file is the one to apply — it adds the year-on-year columns (`yoy_change`, `yoy_pct_change`) via a calendar-year join. The block below is the original, YoY-free version, kept for narrative continuity. **Apply the SQL file, not this snippet.**

```sql
CREATE VIEW v_indicator_latest AS
WITH current_obs AS (
  SELECT o.*
  FROM indicator_observations o
  WHERE o.is_current = true
),
ranked AS (
  SELECT
    o.indicator_id,
    o.period_date,
    o.value,
    o.released_at,
    o.is_revision,
    o.superseded_value,
    ROW_NUMBER() OVER (PARTITION BY o.indicator_id ORDER BY o.period_date DESC) AS rn
  FROM current_obs o
),
cadence AS (
  -- Natural frequency computed from release history, never stored
  SELECT
    indicator_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY gap
    ) AS median_release_gap_days
  FROM (
    SELECT
      indicator_id,
      released_at - LAG(released_at) OVER (
        PARTITION BY indicator_id ORDER BY released_at
      ) AS gap
    FROM current_obs
  ) g
  WHERE gap IS NOT NULL
  GROUP BY indicator_id
)
SELECT
  i.id                AS indicator_id,
  i.name,
  i.short_label,
  i.region,
  i.category,
  i.unit,
  i.decimals,
  latest.period_date,
  latest.value        AS current_value,
  latest.released_at,
  latest.is_revision,
  latest.superseded_value,
  prior.value         AS prior_value,
  (latest.value - prior.value)                              AS change_since_prior,
  CASE WHEN prior.value IS NOT NULL AND prior.value <> 0
       THEN ROUND(((latest.value - prior.value) / ABS(prior.value)) * 100, 2)
  END                                                       AS pct_change_since_prior,
  (CURRENT_DATE - latest.released_at)                       AS days_since_release,
  ROUND(c.median_release_gap_days)                          AS typical_release_gap_days,
  (latest.released_at + (ROUND(c.median_release_gap_days)::int))
                                                            AS expected_next_release
FROM economic_indicators i
LEFT JOIN ranked latest ON latest.indicator_id = i.id AND latest.rn = 1
LEFT JOIN ranked prior  ON prior.indicator_id  = i.id AND prior.rn = 2
LEFT JOIN cadence c      ON c.indicator_id      = i.id
WHERE i.is_active = true
ORDER BY i.region, i.category;
```

> Verify the exact `PERCENTILE_CONT` / window syntax against your Postgres version when Claude Code builds this — the intent is "median gap between releases", and YoY can be added later by joining to the observation 12 periods back rather than computing it inline.

### `v_indicator_series`

A thin helper for sparklines and Rex — current-vintage observations for one indicator, ordered. (Effectively a parameterised filter; included for clarity of intent and so the web app and agents query the same shape.)

```sql
CREATE VIEW v_indicator_series AS
  SELECT
    o.indicator_id,
    i.short_label,
    o.period_date,
    o.value,
    o.released_at
  FROM indicator_observations o
  JOIN economic_indicators i ON i.id = o.indicator_id
  WHERE o.is_current = true
  ORDER BY o.indicator_id, o.period_date ASC;
```

-----

## Agent Integration

### This is a Workflow, not an Agent

The ingest is deterministic: fetch → parse → diff → upsert → maybe-flag. There is no open-ended reasoning, so per the architecture principle this is a **Mastra Workflow**, full stop. The only place a sliver of agent reasoning earns its keep is composing the human-readable Signal summary — and that mirrors how Simon is "primarily a Workflow with an embedded Agent for NLP". Don't reach for an Agent to do an HTTP GET and a numeric comparison.

> Before building, read the `mastra` skill and verify current workflow / step / suspend signatures against the installed package. The structure below is design-level; do not assume the API shape from memory.

### Simon — scheduled indicator poll

Runs inside (or alongside) the existing daily scheduled check. Suggested 08:00 AEST, after the compliance sweep. Per indicator where `is_active = true` and the indicator is due per its `poll_frequency`:

1. Fetch from the indicator's `provider` using `provider_series_code` / `provider_table_ref`. One step per provider adapter (`fred`, `rba`, `abs`) — provider-specific parsing isolated behind a common return shape `{ period_date, value, released_at, raw }`.
1. Diff against the current observation for that `period_date` using the revision rules above.
1. Insert / supersede / no-op accordingly.
1. If a row was inserted **and** (`alert_on_new_print` is true, or `alert_change_threshold` is crossed) → propose a content beat as a *pending* action for Charlie/Margot, and compose a Signal line for Simon's digest.
1. Log the outcome to `agent_activity` with `trigger_type: 'scheduled'`, `agent_name: 'simon'`, recording fetched / inserted / superseded / no-op so there is a complete audit trail even on quiet days.

Agents only ever *propose*. A new M2 print does not auto-publish anything — it lands as a draft beat behind the publish wall, where BTS perspective leads and the indicator is supporting evidence, never the voice.

**Example Signal line in Simon's digest:**

```
Macro update — 2 new prints:

US M2: 21,920 (Apr 2026, released 27 May) — up 0.4% on March, fourth consecutive rise
AU cash rate: 3.85% (held, 18 Jun) — unchanged for the third meeting

Drafted a content beat for the M2 series. Reply to review.
```

### Rex — research and citation

Reads `v_indicator_series` and `v_indicator_latest` to compute deltas and cite exact figures with their `released_at`, respecting the period-vs-release distinction. External sources (Tavily, Jina) remain supplementary; the stored observation is the primary, citable number.

-----

## UI — Page Structure

Lives as a panel on the existing dashboard, beneath or beside the live tickers. The visual job is the opposite of a ticker: **calm, dated, contextual.**

### Layout

- Two groups, clearly labelled: **Local** (RBA cash rate, AU M3, AU CPI) and **Global** (Fed funds, US M2, US CPI) — mirroring the local/global framing the tickers already use.
- One card per indicator.

### Indicator card

- **Value** in `JetBrains Mono`, sized as the focal element, formatted to the indicator's `decimals` and `unit`.
- **"As at" line** — `period_date` and `released_at`, e.g. *"April 2026 · released 27 May"*. This is what kills the fake-live problem: the card is honest that it's a print, not a tick.
- **Delta** — `change_since_prior` / `pct_change_since_prior`, in mono.
- **Sparkline** of recent history from `v_indicator_series`.
- **"Revised from X"** chip when `is_revision` is true.
- A small, low-emphasis *"next release ~ {expected_next_release}"*, computed, so the card tells you when to expect movement instead of implying constant movement.

### A design decision worth making deliberately: colour semantics

Resist green-up / red-down. For these series, **direction is not goodness**. M2 climbing is not "success" — it is precisely the point BTS is making about cash. Colour-coding a rising debasement metric in success-green quietly editorialises in the wrong direction and undercuts the thesis on your own dashboard.

Recommended treatment: deltas are rendered **neutral/directional, not good/bad** — a subdued arrow and the warm text-primary colour, with gold reserved for the *freshness* accent (a newly-released print gets a small gold marker) rather than for the sign of the change. Keep success-green and destructive-red for places where up/down genuinely maps to good/bad (compliance, contracts), not here. This keeps the panel firmly inside the "warm, restrained, let the number do the work" aesthetic and avoids the dashboard arguing against itself.

-----

## Indexes

```sql
CREATE INDEX idx_indicator_obs_indicator ON indicator_observations(indicator_id);
CREATE INDEX idx_indicator_obs_period ON indicator_observations(indicator_id, period_date DESC);
CREATE INDEX idx_indicator_obs_current ON indicator_observations(indicator_id, is_current)
  WHERE is_current = true;
CREATE UNIQUE INDEX uq_indicator_obs_vintage
  ON indicator_observations(indicator_id, period_date, released_at);

CREATE INDEX idx_economic_indicators_region ON economic_indicators(region);
CREATE INDEX idx_economic_indicators_active ON economic_indicators(is_active)
  WHERE is_active = true;
```

-----

## RLS Policies

```sql
ALTER TABLE economic_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "economic_indicators_all" ON economic_indicators
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE indicator_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicator_observations_all" ON indicator_observations
  FOR ALL USING (auth.role() = 'authenticated');
```

(If any indicator panel is later surfaced on the public site, add a read-only public SELECT policy scoped to `is_current = true`, the way `form_submissions` allows public insert — but keep that out of v1.)

-----

## Triggers

```sql
CREATE TRIGGER economic_indicators_updated_at
  BEFORE UPDATE ON economic_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

`indicator_observations` is append/supersede-only and carries no `updated_at` — rows are never edited in place, which is what makes it a clean audit trail.

-----

## Open Questions

- **ABS CPI ingestion cost.** The ABS Data API is SDMX (JSON/ML) and fiddly. Two options: (a) parse the SDMX CPI dataflow properly, or (b) use the newer ABS **monthly CPI indicator** which is simpler and timelier, accepting that it's an indicator not the headline quarterly. Recommendation: ship US CPI (FRED, trivial) in v1, and **defer AU CPI one session** so the ABS adapter doesn't block the whole feature. The registry/observation model is provider-agnostic, so adding ABS later is purely an adapter.
- **FRED revision vintages (ALFRED).** Do we backfill full vintage history, or just track revisions going forward from first ingest? Recommendation: forward-only in v1 (matches RBA/ABS, which can't do better anyway); ALFRED backfill is a nice-to-have for the audit-minded, deferrable.
- **Consensus / surprise scoring.** "Beat or missed expectations" is the most content-rich angle, but there's no clean free forecast source. Deferred until a source is chosen; the `alert_change_threshold` field gives a crude stand-in (large move = noteworthy) in the meantime.
- **Policy rates vs yields boundary.** Bond *yields* are live tickers (already built). Policy *rates* (RBA cash, Fed funds) are slow and belong here. Confirm there's no double-display of the same concept across the two panels.
- **Poll cadence as stored config.** Flagged in the data model — stored deliberately, as operational config distinct from the data's natural (computed) frequency. Worth an explicit sign-off since it brushes against the "computed > stored for cadence" principle.
- **Beat de-duplication.** Simon should not propose a fresh content beat for the same print twice. Reuse the existing `agent_activity` "already flagged this week?" check from the compliance sweep rather than inventing a second mechanism.

-----

## Claude Code Kickoff

> Read [`../../../CLAUDE.md`](../../../CLAUDE.md), then this spec and [`../../../schema.sql`](../../../schema.sql) in full before writing anything. Read [`assumptions.md`](./assumptions.md) for what was inferred without full repo context, and [`adapter-contract.md`](./adapter-contract.md) before Session 2. Read the `mastra` skill and verify all workflow/step API signatures against the installed Mastra version — do not rely on training data.
>
> **Session 1 — data layer.** Add `economic_indicators` and `indicator_observations` tables, the two views, indexes, RLS, and the `updated_at` trigger to the schema. Apply [`sql/seed.sql`](./sql/seed.sql) to load the six v1 indicators (the AU CPI / ABS row is seeded `is_active = false`). Note the YoY-aware `v_indicator_latest` lives in [`sql/v_indicator_latest.sql`](./sql/v_indicator_latest.sql) and supersedes the inline version in the Database Views section below. Stop for review before any agent code.
>
> **Session 2 — ingest workflow.** Read [`adapter-contract.md`](./adapter-contract.md) first. Build the scheduled Mastra Workflow with one provider adapter per `provider` (`fred` first, `rba` second, `abs` deferred), the revision/supersession logic, `agent_activity` logging, and the content-beat proposal step. Workflow, not Agent.
>
> **Session 3 — dashboard panel.** Build the local/global card panel against `v_indicator_latest` and `v_indicator_series`, following [`../../../DESIGN_BRIEF.md`](../../../DESIGN_BRIEF.md). The reference render is [`prototype/macro-indicators-panel.html`](./prototype/macro-indicators-panel.html) — mono numerals, gold reserved for freshness not for the sign of the delta, neutral/directional change colouring (read the colour-semantics note in the UI section before styling deltas, and the React-port contract in the prototype's header comment).
