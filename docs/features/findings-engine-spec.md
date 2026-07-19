# Feature Spec — Findings Engine (Market Report Insight Layer)

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Deterministic findings computation feeding the daily market report narration
**Status:** Draft — spec complete, Session 4 (workflow) implemented
**Last updated:** 2026-07-19

---

## Contents

1. Why this exists
2. The landmine handled first
3. The pipeline
4. Build sequence
5. Verified against @mastra/core 1.51.0
6. Run
7. Spec 1 — Findings Schema
8. Spec 2 — Materiality & Selection
9. Spec 3 — Narration Contract & Lex Gate
10. Spec 4 — Adapter Contract
11. Spec 5 — Assumptions & Open Items
12. Configuration — seed-findings-config.sql
13. Implementation — src/

---

## Why this exists

The daily market report is a list of facts wearing a trench coat. Each indicator is narrated
at its raw level with the nearest cliché from the model's training data, which produces both
blandness ("Fear & Greed remains anchored at 27") and error ("confirming capitulation among
miners" off a single overnight move).

Root cause: the *"what is interesting"* decision is being made by the LLM, with no baseline
and no history to reason over. This is the same failure "Deterministic before LLM" already
solves elsewhere on the platform.

The fix: compute a set of **findings** in deterministic code. Each finding is a scored,
compliance-classified claim about the data. The narrator agent only narrates the findings the
engine already flagged as material, using only the numbers in the finding payload. Lex reviews
against a mechanical checklist keyed to each finding's compliance class.

This is the **deterministic-extract-then-narrate pattern** (from the podcast intelligence
work) applied to indicators. Same spine, different source.

---

## The landmine handled first

The metrics catalog carries both a `poll_interval` and a `natural_granularity`, and they
disagree for the macro series:

| metric | poll_interval | natural_granularity |
|---|---|---|
| US M2, AU Broad Money, US CPI | weekly | monthly |
| RBA Cash Rate, Fed Funds | daily | monthly |
| Hash Rate, DXY, Gold, BTC price, MVRV, RSI … | daily | daily |

If the engine computes "change since yesterday" on a monthly-granularity series it reports no
change most days and then a false one-day anomaly when the monthly figure reprints. That is
literally how "M2 expanded +1.1%" ended up narrated shoulder-to-shoulder with an overnight
hash-rate move. **Comparison windows are resolved from `natural_granularity`, never
`poll_interval`.** Catalog-driven, deterministic, and the first thing to get right.

---


## The pipeline

```
load-series  →  compute-findings  →  score-select  →  narrate(+lint)  →  lex-gate  →  persist
[S1 read]       [S2 pure computors]  [S3 materiality]  [LLM + linter]    [suspend/resume] [S1 write]
   deterministic ───────────────────────────────────────┘   │                │
                                                    only findings      human sign-off
                                                    reach the LLM      when valuation-sensitive
```

Every load-bearing decision happens before the LLM. The narrator only receives the selected
findings and physically cannot reference a metric or a number it wasn't handed — the linter
enforces the number rule mechanically. Lex judges the one thing that needs judgement
(valuation framing); the gate suspends for a human whenever a valuation-sensitive finding is
in play.

---

## Build sequence (Claude Code sessions)

> Session opener, every time: read the specs and `04-adapter-contract.md` first, then verify
> current Mastra API signatures against `node_modules/@mastra/core/dist/docs/` before writing
> workflow code. Session 4 was written against **1.51.0** (see verification notes below); if
> your installed version differs, re-check.

1. **Session 1 — config + data layer.** Apply `seed-findings-config.sql` and the
   `market_reports` table from `04`. Build the granularity resolver, the finding record type
   (`src/schemas.ts` → `packages/shared`), and the `./data-access` + `./config` functions in
   `04`. No compute yet.
2. **Session 2 — finding computors.** One pure function per finding type (`01` §Finding
   types), exposed as `computeFindings` (`04`). Unit-tested against fixtures, no LLM.
3. **Session 3 — materiality + selection.** Implement `02` as `scoreAndSelect` (`04`):
   ranked, floored, top-K selection with the quiet-day path.
4. **Session 4 — workflow + narration.** Already implemented in `src/`. Wires load → compute
   → score → narrate(+lint) → Lex gate (suspend/resume) → persist, with the native daily
   schedule. Register per `src/register.ts`.

---

## Verified against @mastra/core 1.51.0

Session 4 was written against the installed package docs, not memory:

- `createStep` / `createWorkflow` exported from `@mastra/core/workflows`; `Agent` from
  `@mastra/core/agent`; `Mastra` from `@mastra/core` — all confirmed present.
- Step `execute` receives `{ inputData, resumeData, suspendData, mastra, suspend,
  getStepResult, getInitData, ... }`.
- Agents: `mastra.getAgent(name).generate(prompt, { structuredOutput: { schema } })` →
  read `response.object`.
- Suspend/resume via `resumeSchema` / `suspendSchema` + `return await suspend(payload)`;
  resume via `run.resume({ resumeData })` (step omitted when only one step suspends).
- Native `schedule: { cron, timezone, inputData }` on the workflow — no separate register call.

See `05-assumptions.md` for the two things to confirm before running (the `@mastra/pg` store
export name and the evented-engine storage requirement).

---

## Run

```bash
npx mastra dev            # Studio at http://localhost:4111
```

```ts
import { runMarketReport, resumeMarketReport } from './src/register';

await runMarketReport();               // today
await runMarketReport('2026-07-18');   // backfill a date

// after a suspended run's human sign-off (from Simon's Signal handler):
await resumeMarketReport(runId, true);                  // approve
await resumeMarketReport(runId, true, editedMarkdown);  // approve with edits
await resumeMarketReport(runId, false);                 // reject → stored 'held'
```

The scheduled run fires at 08:00 `Australia/Melbourne` (IANA tz handles AEST/AEDT) and shares
the same execution path as manual runs.

---

## Spec 1 — Findings Schema

A **finding** is a deterministically computed, scored, compliance-classified claim about
the indicator data. Findings are the *only* thing the narrator ever sees. If it isn't a
finding, it doesn't exist as far as the report is concerned.

---

### Granularity resolution (do this first)

Every finding declares a `period` resolved from the catalog's `natural_granularity`, not
`poll_interval`:

| natural_granularity | period | change basis | default trailing window |
|---|---|---|---|
| `daily` | `day` | latest vs previous observation | 90 days |
| `monthly` | `month` | latest print vs print ~1 month prior | 24 months |
| `quarterly` | `quarter` | latest print vs print ~1 quarter prior | 12 quarters |

Rules:
- A monthly-granularity series produces **at most one** change-based finding per calendar
  month — on the print that actually changes. Repeated identical values between prints
  produce no finding (they are stale reprints, not data).
- Trailing windows are expressed in *periods*, then converted to calendar days for the
  query. A monthly z-score is computed over ~24 monthly deltas, not 24 daily rows.
- `poll_interval` is used only to decide *staleness* (see finding type 6), never magnitude.

The resolver is a pure function: `resolvePeriod(metric_key) -> { period, changeBasis,
windowDays }`, seeded entirely from the metrics catalog. No metric-specific branching in
the computors.

---

### The finding record

```ts
type FindingType =
  | 'anomaly' | 'divergence' | 'inflection' | 'streak' | 'threshold' | 'staleness';

interface Finding {
  id: string;
  finding_type: FindingType;

  metric_key: string;              // catalog key, e.g. 'hash_rate'
  metric_group: string;            // catalog metric_group
  secondary_metric_key?: string;   // divergence only — the paired series

  period: 'day' | 'month' | 'quarter';
  as_of: string;                   // ISO date of the triggering observation
  window_days: number;             // trailing window actually used

  observed: number;                // the period-appropriate value/delta that triggered it
  baseline: {                      // the distribution it was judged against
    mean: number; sd: number;
    p05: number; p50: number; p95: number;
  };
  unusualness: number;             // 0..1 — percentile distance from baseline
  magnitude_norm: number;          // 0..1 — normalised size of the move
  persistence_periods: number;     // how many consecutive periods the condition has held
  direction: 'up' | 'down' | 'flat_break';  // for logic only — NEVER mapped to colour

  materiality: number;             // 0..1 — set by 02-materiality.md
  compliance_class: 'informational' | 'valuation_sensitive';

  allowed_vocab: string[];         // words the narrator MAY use for this finding
  narration_hint: {                // structured, not prose
    means: string;                 // plain-language meaning of `observed`
    noise_note?: string;           // e.g. "inside normal daily band" / "outside it"
    verdict_allowed: boolean;      // false when persistence_periods === 1 in a noisy series
  };

  evidence_refs: string[];         // observation ids / view rows — the audit trail
}
```

`observed` is always period-appropriate. For `hash_rate` on a daily period it is the 1-day
percent change; for `mvrv` it may be the level. The computor sets it; the narrator never
recomputes.

---

### Finding types

Each computor is a pure function `(series, config) -> Finding[]`. They do not talk to each
other and they do not narrate.

#### 1. Anomaly
Magnitude of the period-change vs its trailing distribution.
- Applies to continuous daily-granularity series: `hash_rate`,
  `next_difficulty_adjustment`, `DXY`, `Gold`, `S&P 500`, `US 10Y`, `btc_price_usd`,
  `active_addresses`, `mvrv`, `rsi_14`, `realized_vol_30d`, `drawdown_from_high`; and the
  monthly macro series at monthly period.
- Fires when `unusualness >= config.anomaly_floor` (default p90 either tail).
- This is what turns "−8%" into "−8%, 4th percentile of the trailing 90 days." The
  percentile is the load-bearing word, and only the computor can supply it honestly.

#### 2. Divergence
A trailing correlation on a **declared pair** breaks — flips sign or falls below the band
it normally holds. Pairs are curated in `seed-findings-config.sql`, never all-pairs (n²
spurious garbage).
- Seed pairs include: `btc_price_usd × US M2` (the liquidity thesis), `× S&P 500`
  (risk-on/off), `× Gold` (store-of-value), `× DXY` (dollar inverse),
  `active_addresses × btc_price_usd` (usage vs price), `miner_revenue_total × hash_rate`
  (miner economics).
- The finding is the *break*, not either series moving. `observed` = current trailing
  correlation; `baseline` = its own recent distribution.
- Note: `hash_rate × difficulty` track by construction — that pair is a *lead* signal (an
  adjustment loading), not a divergence. Handle it as an inflection, not here.

#### 3. Inflection
A trend changes sign or hits a local extremum after a run.
- `fear_greed` stops falling after N weeks; `rsi_14` turns out of a zone; `drawdown_from_high`
  stops deepening; `ma_cross` slope change; difficulty adjustment forecast crossing zero.
- `observed` = the run length that just ended + the turn direction. The *story* is the
  turn, which a level-based report can never see.

#### 4. Streak / persistence
A value has held within a band for N consecutive periods.
- This is the honest reading of "anchored at 27": `fear_greed` in the mid-20s for 3 weeks.
  The persistence **is** the finding.
- `observed` = periods held + the band. Materiality *rises* with persistence for this type
  (opposite of the anomaly guard).

#### 5. Threshold crossing
A named, pre-registered level is crossed. Levels live in `finding_thresholds`.
- `mvrv` through 1.0 / 3.0; `mayer_multiple` through 1.0 / 2.4; `rsi_14` through 30 / 70;
  `btc_price_usd` through `ma_200w`; `ma_cross` (50d through 200d).
- **Every threshold finding is `valuation_sensitive` by default** and routes through Lex.
  These are exactly the "framing as a buy/sell signal" landmines. The seed file sets
  `compliance_class` per threshold explicitly.

#### 6. Staleness (ops only — not narrated in the client report)
A metric has not updated within its `poll_interval` tolerance.
- Distinguishes a *quiet* day from a *broken feed* day. A silent findings engine must be
  silent because nothing was material, never because mempool or Coin Metrics didn't land.
- Surfaced to the director/ops console, not the client report. This is the "state of the
  data is first-class" principle from the podcast review reappearing.

---

### Vocabulary gating

`allowed_vocab` is bound to the finding, seeded per metric group in
`seed-findings-config.sql`. The narrator may only use words in the set for that finding.

The structural guard against the "capitulation on a Tuesday" error:

> **"capitulation" and "recovery" are permitted only on a `hash_ribbons` finding, and only
> when the derived condition state is present.** No `hash_rate` anomaly may carry the word,
> regardless of magnitude.**

So an 8% overnight hash-rate drop can produce an anomaly finding, and the narrator can say
it's outside the normal band and a watch-item — but it physically cannot say "capitulation,"
because that vocabulary lives on a different finding that hasn't fired. The noise/signal
vocabulary is bound to the finding that earned it, not free for the model to reach for.

---

## Spec 2 — Materiality & Selection

Materiality decides which findings survive to narration. It is a pure function over the
finding record — no LLM, no data fetch. Most days most indicators are boring, and the
whole credibility play is a report willing to say so.

---

### The function

```
materiality(f) =
    unusualness(f)
  * (BASE_MAGNITUDE + K_MAG * magnitude_norm(f))
  * persistenceFactor(f)
  * thesisWeight[f.metric_group]
  → clamp to 0..1
```

- `unusualness` and `magnitude_norm` come straight off the finding (0..1).
- `BASE_MAGNITUDE` (default 0.6) keeps an unusual-but-small move alive; `K_MAG` (default
  0.4) lets a large move amplify. A near-unprecedented small move still scores; a giant
  move that is normal for that series does not run away.
- `thesisWeight` is a static per-group prior in `seed-findings-config.sql`. This report is
  for CFOs on the treasury/liquidity thesis, so a liquidity divergence outranks gold
  ticking — by config, not by the model's taste.

Multiplicative, not additive: a finding that is unremarkable on any one axis collapses
toward zero rather than being rescued by another axis. That is the desired behaviour —
"unusual **and** sizeable **and** on-thesis" is the bar.

---

### The persistence guard (the anti-capitulation mechanism)

`persistenceFactor` is where the "confirming capitulation off one overnight print" error
is killed structurally.

```
persistenceFactor(f):
  vol = volClass(f.metric_key)        // low | high, from config; e.g. hash_rate = high

  if f.finding_type in {anomaly, inflection}:
      // single-period moves in noisy series are WEATHER until they persist
      if f.persistence_periods <= 1 and vol == 'high':  return 0.5
      return clamp(0.6 + 0.1 * f.persistence_periods, 0.6, 1.0)

  if f.finding_type == 'streak':
      // persistence IS the point — reward it
      return clamp(0.5 + 0.08 * f.persistence_periods, 0.5, 1.0)

  if f.finding_type in {divergence, threshold}:
      // a confirmed break/crossing is meaningful on day one; mild persistence bonus
      return clamp(0.8 + 0.05 * f.persistence_periods, 0.8, 1.0)
```

Consequence for the worked example: an 8% overnight hash-rate anomaly, `persistence = 1`,
`vol = high` → `persistenceFactor = 0.5`. It survives as a *watch*, never a verdict. And
because `narration_hint.verdict_allowed` is set `false` for `persistence === 1` noisy
findings (see `01`), the narration contract will not allow a conclusion to be drawn from
it. The vocabulary gate does the rest: no `hash_ribbons` finding, no "capitulation."

---

### Selection

```
1. Compute materiality for every finding.
2. Drop staleness findings from the client-report set (they go to ops only).
3. Sort by materiality desc.
4. Take the top K (default K = 3) whose materiality >= FLOOR (default 0.35).
5. If NONE clear FLOOR:
     emit the single highest-materiality finding, flagged { quiet_day: true },
     and set report_mode = 'quiet'.
6. Never pad to K. Fewer real findings beats three manufactured ones.
```

`report_mode = 'quiet'` is a first-class output. It tells the narrator to write the honest
short report — "on-chain was quiet, the only thing worth noting is X" — and the contract
in `03` *forbids* padding to a fixed length in this mode. A CFO stops trusting the report
that has three revelations every single morning; the discipline to be brief is the signal.

---

### Human watch boost (curator-note analogue)

Optional, cheap, and very on-brand. A founder can pin a **watch** — "I care about the
M2 / price divergence right now" — which temporarily multiplies `thesisWeight` for that
metric group or declared pair.

```
finding_watch { id, target (metric_group | pair), boost (e.g. 1.5), expires_at, note }
```

This is the "curator notes as first-class data" principle pointed at indicators: human
intent becomes a first-class input to what counts as material, and the `note` is retained
as audit context for why a finding was surfaced. Defer the UI; the table and the multiply
are the whole mechanism.

---

### Alignment with Rex

Emit each surviving finding in the same envelope shape Rex uses for research
novelty/relevance, so one scoring vocabulary spans both sources and the narration step
consumes a single contract regardless of origin. This is the concrete piping of a scoring
signal into narration that Rex's scores were always meant for — closing that gap by
analogy rather than a bespoke second scorer.

---

### Defaults (tune in config, not code)

| Constant | Default | Notes |
|---|---|---|
| `anomaly_floor` (unusualness) | p90 | both tails |
| `BASE_MAGNITUDE` | 0.6 | keeps unusual-but-small alive |
| `K_MAG` | 0.4 | large-move amplifier |
| `FLOOR` (materiality) | 0.35 | below this → quiet day |
| `K` (max findings) | 3 | hard ceiling, never a target |
| divergence `corr_window_days` | 60 | per-pair override in seed |

---

## Spec 3 — Narration Contract & Lex Gate

This is where the LLM finally appears — and its job is deliberately small. It narrates the
selected findings and nothing else. Lex reviews the output against a mechanical checklist
keyed to each finding's `compliance_class`. Compliance stops being a vibe and becomes
pass/fail.

---

### Narrator input

The narrator agent receives **only** the selected `Finding[]` (plus `report_mode`). It does
**not** receive the raw observation series, the full catalog, or any metric that did not
produce a finding.

```json
{
  "report_mode": "normal | quiet",
  "as_of": "2026-07-19",
  "findings": [ /* selected Finding records from 02 */ ]
}
```

This is structural, not a guideline: the narrator cannot editorialise about gold if gold
produced no finding, because gold's numbers are not in its context. It cannot invent
"capitulation" because no `hash_ribbons` finding is present and the word is not in any
provided `allowed_vocab`.

---

### Narrator rules

1. **Payload-only numbers.** Every figure in the prose must appear in a finding's
   `observed`, `baseline`, or `narration_hint`. The narrator may not compute, restate, or
   round a number that is not in the payload. (This alone kills "confirming capitulation" —
   there is no such number to cite.)
2. **No finding, no mention.** A metric absent from `findings` may not appear in the report.
3. **Vocabulary.** Only words in each finding's `allowed_vocab` may be used to characterise
   it. Neutral connective prose is fine; characterising verbs are gated.
4. **Verdict discipline.** If `narration_hint.verdict_allowed === false`, the finding is
   narrated as a watch-item with explicit hedging ("often reverses within a day", "watch
   the next print"), never as a conclusion.
5. **Quiet mode.** When `report_mode === 'quiet'`, write the short honest report. Do not
   pad. "On-chain was quiet overnight; the one thing worth noting is …" is a complete,
   acceptable report.
6. **Lead with the finding, not the level.** Open on the most material finding's
   `narration_hint.means`, with the unusualness as support ("outside its normal band, the
   sharpest in N weeks"), not on the raw value.

#### Reference: the same overnight, narrated from findings

> The one move worth attention: hash rate fell 8% overnight, outside its normal daily band
> and the sharpest single-day drop in N weeks. Moves like this often reverse within a day,
> so it is a watch-item rather than a verdict — the tell is the next difficulty adjustment,
> tracking −2.2%. M2's +1.1% is unremarkable over a month, and Fear & Greed has now sat in
> the mid-20s for three weeks, where the persistence is more interesting than the level.

Note which words are load-bearing: *outside its normal band*, *sharpest in N weeks*,
*unremarkable over a month*, *three weeks*. Every one came from a finding, not the model.

---

### Lex gate — mechanical checklist

Runs on the narrator's draft before it reaches any surface. Implemented as a workflow
**suspend/resume** step: if any selected finding is `valuation_sensitive`, the workflow
suspends for Lex (agent or human) and resumes on pass. Logged to `agent_activity` as
proposed → approved.

**Per-finding checks (keyed to `compliance_class`):**

| Check | Applies to | Pass condition |
|---|---|---|
| Number provenance | all | every figure traces to a finding payload field |
| Vocabulary | all | characterising words ⊆ that finding's `allowed_vocab` |
| Verdict discipline | `verdict_allowed === false` | no conclusion drawn; hedge present |
| No action framing | `valuation_sensitive` | no "buy/sell/undervalued/overvalued/cheap/expensive/signal to" |
| Mandated hedge | `valuation_sensitive` | valuation metric framed as observation, not recommendation |
| Capitulation lock | any hash finding | word "capitulation" present ⇒ a `hash_ribbons` finding with condition state exists |

**House-style checks (all reports — your existing hard editorial rules, now enforced
mechanically):**

| Check | Pass condition |
|---|---|
| Bitcoin vs bitcoin | network/protocol capitalised, currency/unit lower-case |
| No exclamation marks | none present |
| Australian English | -ise / -our spellings |
| No hype register | no superlative or urgency language beyond finding facts |
| No green-up/red-down | if the report carries any viz, `direction` is never mapped to colour; gold reserved for freshness only |

A failing check returns the specific finding id and rule to the workflow, which either
loops the narrator once with the violation noted or holds for human review. No silent
pass-through.

---

### Output

```json
{
  "report_markdown": "…",
  "report_mode": "normal | quiet",
  "findings_used": ["finding_id", "…"],
  "lex_result": { "status": "approved | held", "failed_checks": [] }
}
```

`findings_used` is the audit link back to the deterministic evidence. If ASIC or a client
ever asks "why did the report say that," every claim resolves to a finding, and every
finding resolves to `evidence_refs` on the observation rows. The whole chain is
reconstructable — which is the point of doing the analysis in code.

---

## Spec 4 — Adapter Contract

The workflow in `src/` orchestrates functions produced by the earlier build sessions. This
is the seam between the deterministic engine (Sessions 1–3) and the orchestration (Session
4). Every import below must exist with these exact signatures for `src/` to compile and run.
Types reference `src/schemas.ts`.

---

### `./config` — catalog + seed tables

```ts
interface FindingConfig {
  // Loaded from the metrics catalog + the seed tables in seed-findings-config.sql.
  catalog: Record<string, {           // keyed by metric_key
    metric_group: string;
    natural_granularity: 'daily' | 'monthly' | 'quarterly';
    poll_interval: string;
    kind: 'fetched' | 'derived';
  }>;
  metricConfig: Record<string, {      // keyed by metric_group — finding_metric_config
    thesis_weight: number;
    vol_class: 'low' | 'high';
    allowed_vocab: string[];
  }>;
  divergencePairs: Array<{
    primary_key: string; secondary_key: string;
    expected_sign: 'positive' | 'negative';
    corr_window_days: number; break_threshold: number;
  }>;
  thresholds: Array<{
    metric_key: string; level_name: string; level_value: number;
    cross_direction: 'up' | 'down' | 'either';
    compliance_class: 'informational' | 'valuation_sensitive';
  }>;
  // Tunables from 02-materiality.md §Defaults (anomaly_floor, BASE_MAGNITUDE, K_MAG, FLOOR, K).
  tunables: Record<string, number>;
}

interface ActiveWatch {                // non-expired finding_watch rows
  target_type: 'metric_group' | 'pair';
  target_ref: string;                  // group name, or 'primary_key|secondary_key'
  boost: number;
}

export function loadFindingConfig(): Promise<FindingConfig>;
export function loadActiveWatches(): Promise<ActiveWatch[]>;
```

Recommendation: export `FindingConfig` and `ActiveWatch` from `packages/shared` so the
computors (S2) and materiality (S3) import the same shapes the workflow passes them.

---

### `./computors` — Session 2

```ts
import type { Finding } from './schemas';

// Pure. Runs all six type-computors (anomaly, divergence, inflection, streak, threshold,
// staleness) over the loaded series and returns every finding, unscored. Materiality is
// set later by scoreAndSelect. No LLM, no I/O.
export function computeFindings(bundle: ObservationBundle, config: FindingConfig): Finding[];
```

`ObservationBundle` is whatever `loadObservationBundle` returns (below) — the raw + derived
series the computors read. Its internal shape is Session 1/2's concern; the workflow treats
it as opaque (`z.any()` at the step boundary).

---

### `./materiality` — Session 3

```ts
import type { Finding, Selection } from './schemas';

// Pure. Applies the materiality function, watch boosts, top-K selection and the quiet-day
// floor (02-materiality.md). Strips staleness from the client set into `ops_findings`.
export function scoreAndSelect(
  findings: Finding[],
  config: FindingConfig,
  watches: ActiveWatch[],
): Selection;
```

`Selection.as_of` is overwritten by the workflow from the run's `as_of`, so it need not be
set here.

---

### `./data-access` — Session 1

```ts
// Reads the observation series for the report date. Series length must cover the longest
// trailing window any computor needs (24 monthly periods ≈ 730 days; keep a margin).
export function loadObservationBundle(asOf: string): Promise<ObservationBundle>;

// Upsert on as_of — a re-run or backfill overwrites that day's report rather than duplicating.
export function insertMarketReport(row: {
  as_of: string;
  status: 'approved' | 'held';
  report_mode: 'normal' | 'quiet';
  report_markdown: string;
  findings_used: string[];
}): Promise<void>;

// Your existing agent_activity pattern.
export function logAgentActivity(entry: {
  agent_name: string;
  action: string;
  trigger_type: 'scheduled' | 'manual' | 'signal_message' | 'call_transcript';
  trigger_ref: string;
  proposed_actions: unknown[];
}): Promise<void>;
```

---

### Table Session 1 must add: `market_reports`

Mirrors your existing content-table style. One row per report date; upsert on re-run.

```sql
CREATE TABLE market_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of           DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('approved', 'held')),
  report_mode     TEXT NOT NULL CHECK (report_mode IN ('normal', 'quiet')),
  report_markdown TEXT NOT NULL,
  findings_used   JSONB NOT NULL DEFAULT '[]',
  created_by      UUID REFERENCES team_members(id),  -- null for scheduled runs
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER market_reports_updated_at
  BEFORE UPDATE ON market_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- One report per day → insertMarketReport upserts on this.
CREATE UNIQUE INDEX idx_market_reports_as_of ON market_reports(as_of);

ALTER TABLE market_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_reports_all" ON market_reports
  FOR ALL USING (auth.role() = 'authenticated');
```

`status = 'held'` reports are stored too — the ops console shows what is awaiting sign-off,
and the `updated_at` trigger tracks when a held report is later approved and re-persisted.

---

## Spec 5 — Assumptions & Open Items

The caveats that were scattered across the specs and code comments, in one place. None block
the build; each is a decision or a check to make before the relevant session.

---

### Confirm before building

- **Coin Metrics community tier.** `mvrv`, `realised_cap`, `active_addresses`, `PriceUSD`
  come from Coin Metrics community tier, which shifted in late 2025. Verify the live catalog
  still exposes these codes before the Session 2 computors depend on them. If a code has
  moved tiers, the affected findings (MVRV threshold, active-address anomaly) degrade
  gracefully to "no finding" rather than erroring — but confirm rather than discover.
- **`@mastra/pg` store export name.** `src/register.ts` imports `PostgresStore` from
  `@mastra/pg`. That package was not in the verification sandbox, so confirm the exact export
  against your installed version. This is Mastra's own snapshot/schedule store — distinct from
  your app's Supabase client and its RLS-guarded tables.
- **Scheduler needs a concurrency-capable store.** Declaring `schedule` on the workflow
  auto-promotes it to Mastra's evented engine, which requires a store supporting concurrent
  updates (Postgres/LibSQL qualify; in-memory does not). If the store can't, `createRun()`
  throws a clear error pointing at the `schedule` field.
- **tsconfig.** Mastra needs `target`/`module` = ES2022 and `moduleResolution: bundler`.
  Your `apps/agents` should already be set this way; confirm before the first build.

---

### Decisions taken (change if you disagree)

- **Corrective narrator loop fires once.** If the rewrite still trips a hard house-style
  check, the report goes to the human via the gate rather than looping the model. Rationale:
  a report the narrator can't get clean in two passes is exactly the one a person should see.
  Do not let an LLM grind against a compliance linter unsupervised.
- **Bitcoin/bitcoin check is `warn`, not `hard`.** Deterministic capitalisation detection
  can't be perfect, so the linter flags the obvious cases and leaves the rest to Lex. `!`
  and Australian-spelling checks are `hard` — they're unambiguous.
- **Compute is one deterministic step, not parallel steps.** The six computors are pure
  functions; splitting them across parallel workflow steps buys snapshot/serialisation
  overhead for no concurrency benefit.
- **Divergence pairs and threshold levels are seeded defaults.** The M2/price correlation
  window (90d) especially is a guess at the horizon a CFO cares about — tune against your own
  history. `ma_200w` and `ma_cross` are dynamic-level thresholds (a moving average, not a
  constant), computed against the view, not seeded as fixed numbers.
- **No auto-approval on a timer.** A valuation-sensitive report left unanswered stays
  suspended; the snapshot persists across restarts. It is never auto-approved.

---

### Deferred (not in this build)

- **Staleness → client report.** Staleness findings go to the ops console only. Surfacing
  "the mempool feed was down" to clients is a separate director-experience decision.
- **`finding_watch` UI.** The table and the materiality multiply exist; the pin-a-watch UI
  is deferred. Watches can be inserted directly until then.
- **Rex envelope alignment.** Emitting findings in Rex's scorer envelope (so one scoring
  vocabulary spans research and indicators) is specified in `02-materiality.md §Alignment
  with Rex` but not wired here. Low effort, high tidiness — do it when touching Rex next.
- **Backfill beyond a single day.** `runMarketReport(asOf)` handles one date. A range
  backfill is a trivial loop over dates if you ever need to seed history.

---

## Configuration — seed-findings-config.sql

```sql
-- ============================================================
-- FINDINGS ENGINE — DETERMINISTIC CONFIG (SEED)
-- Bitcoin Treasury Solutions internal platform
-- Read by the finding computors and the materiality function.
-- Apply after the observation tables/views exist.
-- ============================================================

-- ------------------------------------------------------------
-- Per-group scoring config: thesis weight, volatility class,
-- and the vocabulary the narrator is permitted to use.
-- metric_group values match the metrics catalog.
-- ------------------------------------------------------------
CREATE TABLE finding_metric_config (
  metric_group   TEXT PRIMARY KEY,
  thesis_weight  NUMERIC(4,2) NOT NULL DEFAULT 1.00,  -- static prior; CFO/liquidity thesis
  vol_class      TEXT NOT NULL DEFAULT 'low'          -- 'low' | 'high' — drives persistence guard
                 CHECK (vol_class IN ('low','high')),
  allowed_vocab  TEXT[] NOT NULL DEFAULT '{}',        -- words the narrator MAY use
  notes          TEXT
);

INSERT INTO finding_metric_config (metric_group, thesis_weight, vol_class, allowed_vocab, notes) VALUES
  ('money_supply',        1.40, 'low',  ARRAY['liquidity','expansion','contraction','easing','tightening']::TEXT[],
     'Core to the treasury/liquidity thesis — weighted up.'),
  ('policy_rate',         1.30, 'low',  ARRAY['policy','tightening','easing','hold','cut','hike']::TEXT[],
     'Meeting-driven; monthly granularity.'),
  ('behaviour_valuation', 1.20, 'high', ARRAY['on-chain activity','usage','holder behaviour']::TEXT[],
     'Contains valuation-sensitive metrics — see thresholds table.'),
  ('network_security',    1.10, 'high', ARRAY['hash rate','difficulty','miner economics','fee share','tightening','easing']::TEXT[],
     'High daily noise; capitulation vocab is NOT here — see hash_ribbons lock.'),
  ('trend_valuation',     1.00, 'high', ARRAY['trend','momentum','range','volatility','drawdown']::TEXT[],
     'Valuation-sensitive members gated via thresholds table.'),
  ('fx',                  0.90, 'high', ARRAY['dollar','strength','weakness']::TEXT[], NULL),
  ('commodity',           0.80, 'high', ARRAY['gold','store of value']::TEXT[], NULL),
  ('equity',              0.90, 'high', ARRAY['risk appetite','risk-on','risk-off']::TEXT[], NULL),
  ('bond_yield',          0.90, 'high', ARRAY['yields','duration']::TEXT[], NULL),
  ('inflation',           1.10, 'low',  ARRAY['inflation','price pressure','disinflation']::TEXT[], NULL),
  ('market_snapshot',     0.70, 'high', ARRAY['price','sentiment']::TEXT[],
     'Context group; rarely leads a report on its own.');

-- Capitulation lock, enforced in the narration contract, is documented here for the
-- computor author: the words 'capitulation'/'recovery' are permitted ONLY on a
-- hash_ribbons finding whose derived condition state is present. They appear in NO group's
-- allowed_vocab above by design.


-- ------------------------------------------------------------
-- Declared divergence pairs. Curated only — never all-pairs.
-- The finding fires when trailing correlation flips sign or
-- falls below the band it normally holds.
-- ------------------------------------------------------------
CREATE TABLE finding_divergence_pairs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_key       TEXT NOT NULL,   -- metrics-catalog key
  secondary_key     TEXT NOT NULL,   -- metrics-catalog key
  expected_sign     TEXT NOT NULL CHECK (expected_sign IN ('positive','negative')),
  corr_window_days  INT  NOT NULL DEFAULT 60,
  break_threshold   NUMERIC(3,2) NOT NULL DEFAULT 0.35, -- |corr| below this = break of expected relationship
  thesis_note       TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (primary_key, secondary_key)
);

INSERT INTO finding_divergence_pairs
  (primary_key, secondary_key, expected_sign, corr_window_days, break_threshold, thesis_note) VALUES
  ('btc_price_usd',    'US M2',          'positive', 90, 0.30, 'The liquidity thesis — the headline pair for CFOs.'),
  ('btc_price_usd',    'S&P 500',        'positive', 60, 0.35, 'Risk-on / risk-off coupling.'),
  ('btc_price_usd',    'Gold',           'positive', 90, 0.30, 'Store-of-value narrative.'),
  ('btc_price_usd',    'DXY',            'negative', 60, 0.35, 'Dollar inverse; break = decoupling from the dollar.'),
  ('active_addresses', 'btc_price_usd',  'positive', 60, 0.35, 'Usage vs price — thin usage into strength is notable.'),
  ('miner_revenue_total','hash_rate',    'positive', 60, 0.40, 'Miner economics — revenue falling while hash holds.');

-- Note: hash_rate x difficulty is intentionally NOT a divergence pair. They track by
-- construction; a gap there means an adjustment is loading and is handled as an inflection.


-- ------------------------------------------------------------
-- Named threshold crossings. Pre-registered levels only.
-- Every row defaults to valuation_sensitive → routes through Lex.
-- ------------------------------------------------------------
CREATE TABLE finding_thresholds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key        TEXT NOT NULL,          -- metrics-catalog key
  level_name        TEXT NOT NULL,          -- human label for the level
  level_value       NUMERIC NOT NULL,
  cross_direction   TEXT NOT NULL CHECK (cross_direction IN ('up','down','either')),
  compliance_class  TEXT NOT NULL DEFAULT 'valuation_sensitive'
                    CHECK (compliance_class IN ('informational','valuation_sensitive')),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (metric_key, level_name)
);

INSERT INTO finding_thresholds
  (metric_key, level_name, level_value, cross_direction, compliance_class) VALUES
  ('mvrv',          'MVRV 1.0',            1.0,  'either', 'valuation_sensitive'),
  ('mvrv',          'MVRV 3.0',            3.0,  'either', 'valuation_sensitive'),
  ('mayer_multiple','Mayer 1.0',           1.0,  'either', 'valuation_sensitive'),
  ('mayer_multiple','Mayer 2.4',           2.4,  'either', 'valuation_sensitive'),
  ('rsi_14',        'RSI 30 (oversold)',   30.0, 'down',   'valuation_sensitive'),
  ('rsi_14',        'RSI 70 (overbought)', 70.0, 'up',     'valuation_sensitive'),
  ('ma_cross',      '50d crosses 200d',    0.0,  'either', 'valuation_sensitive'),
  ('fear_greed',    'F&G 25 (fear band)',  25.0, 'either', 'informational'),
  ('fear_greed',    'F&G 75 (greed band)', 75.0, 'either', 'informational');

-- btc_price_usd through ma_200w is a threshold too, but the level is dynamic (a moving
-- average, not a constant). Compute it in the threshold computor against the ma_200w view
-- rather than seeding a fixed level_value here.


-- ------------------------------------------------------------
-- Human watch boosts (curator-note analogue). Optional input to
-- materiality: temporarily lifts thesis_weight for a group or pair.
-- ------------------------------------------------------------
CREATE TABLE finding_watch (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('metric_group','pair')),
  target_ref  TEXT NOT NULL,                  -- metric_group name, or 'primary_key|secondary_key'
  boost       NUMERIC(3,2) NOT NULL DEFAULT 1.50,
  note        TEXT,                            -- WHY — retained as audit context
  created_by  UUID REFERENCES team_members(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX idx_finding_watch_active ON finding_watch(expires_at);
```

---

## Implementation — src/

The six files below land in `apps/agents/src/`. Written against @mastra/core 1.51.0 (see the verification section above).

### src/schemas.ts

```ts
// schemas.ts
// The currency the workflow passes between steps. Move to packages/shared so the
// computors (Session 2), materiality (Session 3), and the web app all import one shape.
//
// Verified against @mastra/core 1.51.0 — steps accept Standard JSON Schema (Zod here).

import { z } from 'zod';

export const findingType = z.enum([
  'anomaly',
  'divergence',
  'inflection',
  'streak',
  'threshold',
  'staleness',
]);

export const complianceClass = z.enum(['informational', 'valuation_sensitive']);

// Mirrors 01-findings-schema.md exactly.
export const findingSchema = z.object({
  id: z.string(),
  finding_type: findingType,

  metric_key: z.string(),
  metric_group: z.string(),
  secondary_metric_key: z.string().optional(), // divergence only

  period: z.enum(['day', 'month', 'quarter']),
  as_of: z.string(), // ISO date
  window_days: z.number(),

  observed: z.number(),
  baseline: z.object({
    mean: z.number(),
    sd: z.number(),
    p05: z.number(),
    p50: z.number(),
    p95: z.number(),
  }),
  unusualness: z.number(),
  magnitude_norm: z.number(),
  persistence_periods: z.number(),
  direction: z.enum(['up', 'down', 'flat_break']), // logic only — never mapped to colour

  materiality: z.number(),
  compliance_class: complianceClass,

  allowed_vocab: z.array(z.string()),
  narration_hint: z.object({
    means: z.string(),
    noise_note: z.string().optional(),
    verdict_allowed: z.boolean(),
  }),

  evidence_refs: z.array(z.string()),
});
export type Finding = z.infer<typeof findingSchema>;

// Output of Session 3's scoreAndSelect — the narrator's entire universe.
export const selectionSchema = z.object({
  as_of: z.string(),
  report_mode: z.enum(['normal', 'quiet']),
  findings: z.array(findingSchema), // client-report set only (staleness already stripped)
  ops_findings: z.array(findingSchema), // staleness etc. — for the director console, not narrated
});
export type Selection = z.infer<typeof selectionSchema>;

// What the narrator agent returns (structuredOutput).
export const narrationSchema = z.object({
  report_markdown: z.string(),
  findings_used: z.array(z.string()), // finding ids referenced
});
export type Narration = z.infer<typeof narrationSchema>;

// Deterministic house-style linter result (house-style-linter.ts).
export const lintSchema = z.object({
  pass: z.boolean(),
  violations: z.array(
    z.object({
      rule: z.string(),
      severity: z.enum(['hard', 'warn']),
      detail: z.string(),
    }),
  ),
});
export type LintResult = z.infer<typeof lintSchema>;

// What the Lex agent returns for the semantic (valuation-framing) review.
export const lexReviewSchema = z.object({
  status: z.enum(['pass', 'fail']),
  failed_checks: z.array(
    z.object({
      finding_id: z.string().optional(),
      rule: z.string(),
      detail: z.string(),
    }),
  ),
});
export type LexReview = z.infer<typeof lexReviewSchema>;

// Final workflow output.
export const reportResultSchema = z.object({
  as_of: z.string(),
  report_mode: z.enum(['normal', 'quiet']),
  report_markdown: z.string(),
  findings_used: z.array(z.string()),
  lex_result: z.object({
    status: z.enum(['approved', 'held']),
    failed_checks: z.array(z.any()),
  }),
});
export type ReportResult = z.infer<typeof reportResultSchema>;

// The payload the gate hands to Simon when it suspends for human sign-off.
export const approvalSuspendSchema = z.object({
  as_of: z.string(),
  report_markdown: z.string(),
  findings_used: z.array(z.string()),
  reason: z.string(), // why a human is needed: valuation_sensitive present and/or lint/lex flags
  lint_violations: lintSchema.shape.violations,
  lex_review: lexReviewSchema,
});

// What the human sends back (via Simon / Signal) to resume the run.
export const approvalResumeSchema = z.object({
  approved: z.boolean(),
  edited_markdown: z.string().optional(), // human may hand-edit before approving
});
```

### src/house-style-linter.ts

```ts
// house-style-linter.ts
// Deterministic-before-LLM: the house rules that can be checked mechanically are checked
// mechanically, BEFORE Lex the agent is ever invoked. Cheaper, non-negotiable, no tokens.
// The Lex agent (lex-report-reviewer.agent.ts) only judges what genuinely needs reasoning:
// valuation framing. Everything in this file is a pure function.
//
// Shares its spirit with the deferred social-post linter — if you build that, factor the
// shared checks (exclamation marks, AU spelling) into one module.

import type { Finding, LintResult } from './schemas';

// --- Australian English: common Americanisms to flag. Extend as needed. -----------------
const AMERICANISMS: Array<[RegExp, string]> = [
  [/\b(\w+?)izing\b/gi, '-ising'],
  [/\b(\w+?)ize\b/gi, '-ise'],
  [/\b(\w+?)ization\b/gi, '-isation'],
  [/\bcolor\b/gi, 'colour'],
  [/\bfavor(ite|able)?\b/gi, 'favour…'],
  [/\bbehavior\b/gi, 'behaviour'],
  [/\bcenter\b/gi, 'centre'],
  [/\banalyze\b/gi, 'analyse'],
];
// Guard: some proper nouns/codes legitimately use -ize (rare here). Keep the list tight.

// --- Bitcoin vs bitcoin (heuristic assist; Lex catches the rest) ------------------------
// Hard rule in house style, but perfect detection isn't deterministic. Flag the clear cases:
//  - lowercase "bitcoin" directly qualifying network/protocol/blockchain -> should be capital
//  - capitalised "Bitcoin" directly attached to a price/percentage/unit -> likely the unit
function bitcoinCapitalisation(text: string) {
  const violations: LintResult['violations'] = [];

  const networkLower = /\bbitcoin (network|protocol|blockchain)\b/g;
  for (const m of text.matchAll(networkLower)) {
    violations.push({
      rule: 'bitcoin_capitalisation',
      severity: 'warn',
      detail: `"${m[0]}" — network/protocol sense should be capitalised "Bitcoin".`,
    });
  }

  // "Bitcoin" immediately followed by a number/percent or "fell/rose/was up" reads as the unit.
  const unitUpper = /\bBitcoin\s+(?=[-+]?\d|(?:fell|rose|dropped|gained|was (?:up|down)))/g;
  for (const m of text.matchAll(unitUpper)) {
    violations.push({
      rule: 'bitcoin_capitalisation',
      severity: 'warn',
      detail: `"Bitcoin" before a price/movement reads as the unit — likely lower-case "bitcoin".`,
    });
  }
  return violations;
}

// --- No exclamation marks (hard) --------------------------------------------------------
function noExclamation(text: string) {
  const violations: LintResult['violations'] = [];
  if (text.includes('!')) {
    violations.push({
      rule: 'no_exclamation',
      severity: 'hard',
      detail: 'Exclamation mark present. House style forbids exclamation marks in copy.',
    });
  }
  return violations;
}

function australianSpelling(text: string) {
  const violations: LintResult['violations'] = [];
  for (const [re, fix] of AMERICANISMS) {
    for (const m of text.matchAll(re)) {
      violations.push({
        rule: 'australian_english',
        severity: 'hard',
        detail: `"${m[0]}" → Australian spelling (${fix}).`,
      });
    }
  }
  return violations;
}

// --- Payload-only numbers (hard) — the anti-hallucination guard --------------------------
// Every SALIENT number in the prose (percentages and decimals) must trace to a number in
// the finding payload. Bare small integers (1–31) are exempt: they are almost always dates,
// period labels ("50-day", "14"), or list counts, not claimed measurements.
function extractSalientNumbers(text: string): number[] {
  const out: number[] = [];
  // percentages and decimals, signed
  for (const m of text.matchAll(/[-+]?\d+\.?\d*\s?%/g)) {
    out.push(parseFloat(m[0].replace('%', '')));
  }
  for (const m of text.matchAll(/[-+]?\d+\.\d+/g)) {
    out.push(parseFloat(m[0]));
  }
  return out;
}

function payloadNumbers(findings: Finding[]): number[] {
  const nums: number[] = [];
  for (const f of findings) {
    nums.push(f.observed, f.unusualness, f.magnitude_norm, f.persistence_periods);
    nums.push(f.baseline.mean, f.baseline.sd, f.baseline.p05, f.baseline.p50, f.baseline.p95);
    // pull any numbers embedded in the narration hint strings (e.g. "−2.2%")
    for (const s of [f.narration_hint.means, f.narration_hint.noise_note ?? '']) {
      for (const m of s.matchAll(/[-+]?\d+\.?\d*/g)) nums.push(parseFloat(m[0]));
    }
  }
  return nums;
}

function numbersInPayload(text: string, findings: Finding[], tol = 0.05) {
  const violations: LintResult['violations'] = [];
  const allowed = payloadNumbers(findings);
  for (const n of extractSalientNumbers(text)) {
    const ok = allowed.some((a) => {
      const scale = Math.max(Math.abs(a), 1);
      return Math.abs(a - n) <= tol * scale;
    });
    if (!ok) {
      violations.push({
        rule: 'payload_only_numbers',
        severity: 'hard',
        detail: `The figure ${n} does not trace to any finding payload value.`,
      });
    }
  }
  return violations;
}

// --- Public API -------------------------------------------------------------------------
export function runHouseStyle(text: string, findings: Finding[]): LintResult {
  const violations = [
    ...noExclamation(text),
    ...australianSpelling(text),
    ...bitcoinCapitalisation(text),
    ...numbersInPayload(text, findings),
  ];
  // "pass" = no HARD violations. Warnings are surfaced but don't block.
  const pass = !violations.some((v) => v.severity === 'hard');
  return { pass, violations };
}

// A compact violation summary the narrator can be re-prompted with on a corrective pass.
export function summariseViolations(v: LintResult['violations']): string {
  return v.map((x) => `- [${x.severity}] ${x.rule}: ${x.detail}`).join('\n');
}
```

### src/market-narrator.agent.ts

```ts
// market-narrator.agent.ts
// The ONLY LLM in the report path. Its universe is the selected findings — nothing else.
// Instructions encode 03-narration-contract.md. Verified against @mastra/core 1.51.0.

import { Agent } from '@mastra/core/agent';

export const marketNarrator = new Agent({
  name: 'market-narrator',
  // provider/model-name format required by Mastra.
  model: 'anthropic/claude-sonnet-4-5',
  instructions: `
You narrate a daily bitcoin market report for a CFO audience. You are handed a set of
already-computed FINDINGS as JSON. You do not have the raw data, and you must not ask for it.

Hard rules (a compliance officer checks your output against these):

1. PAYLOAD-ONLY NUMBERS. Every figure you write must come from a finding's fields
   (observed, baseline, narration_hint). Never compute, infer, or round a number that is
   not in the payload. If you don't have a number, don't state one.

2. NO FINDING, NO MENTION. A metric that is not in the findings array does not appear in
   the report. You cannot editorialise about anything you were not handed.

3. VOCABULARY. To characterise a finding, use only words in that finding's allowed_vocab.
   Neutral connective prose is fine. In particular: never write "capitulation" or
   "recovery" unless a finding explicitly permits it in allowed_vocab.

4. VERDICT DISCIPLINE. If a finding has narration_hint.verdict_allowed = false, narrate it
   as a WATCH-ITEM with explicit hedging ("often reverses within a day", "watch the next
   print") — never as a conclusion.

5. NO ACTION FRAMING. Never imply buy/sell, cheap/expensive, under/overvalued, or "a signal
   to" anything. You describe what the data did, not what anyone should do.

6. QUIET MODE. If report_mode is "quiet", write the short honest report. Do NOT pad to a
   fixed length. "On-chain was quiet overnight; the one thing worth noting is X." is a
   complete and acceptable report. A report that manufactures insight every day is worse
   than one that admits a quiet day.

7. LEAD WITH THE FINDING, NOT THE LEVEL. Open on the most material finding's meaning, with
   the unusualness as support (e.g. "outside its normal band, the sharpest in N weeks"),
   not on a raw value.

House style: Australian English. No exclamation marks. "Bitcoin" capitalised for the
network/protocol, "bitcoin" lower-case for the currency/unit. Plain, measured, CFO register.
No hype. Do not use the words "delve", "underscore", or "landscape".

Output: return report_markdown (the report) and findings_used (the ids you referenced).
`.trim(),
});
```

### src/lex-report-reviewer.agent.ts

```ts
// lex-report-reviewer.agent.ts
// A focused review persona for Lex. The mechanical house-style checks already ran in
// house-style-linter.ts (deterministic). Lex only judges what needs reasoning: whether a
// valuation-sensitive finding has been framed as advice rather than observation.
//
// If Lex already exists in your roster as a broader agent, this can instead be a specialised
// tool/instruction on that agent. Kept as a thin agent here so it drops in cleanly.

import { Agent } from '@mastra/core/agent';

export const lexReportReviewer = new Agent({
  name: 'lex-report-reviewer',
  model: 'anthropic/claude-sonnet-4-5',
  instructions: `
You are Lex, the compliance reviewer, operating under an AFSL Authorised Representative
arrangement. You review a drafted bitcoin market report before it can be published.

You are given: the drafted report markdown, and the findings it was built from (with each
finding's compliance_class). Your ONLY job is to judge FRAMING of valuation-sensitive
findings. Mechanical checks (spelling, exclamation marks, number provenance) have already
passed — do not re-do them.

Fail the report if any of the following is true for a valuation_sensitive finding
(MVRV, Mayer Multiple, RSI, moving-average crosses, realised price, Hash Ribbons):

- It is framed as a recommendation or signal to act (buy, sell, accumulate, take profit,
  "a signal to…", "time to…").
- It is framed as a valuation verdict ("undervalued", "overvalued", "cheap", "expensive",
  "fair value").
- A metric is presented as predictive of price rather than descriptive of current state.
- A single-period move is stated as a conclusion where the finding marked verdict_allowed
  false.
- "capitulation"/"recovery" appears without a Hash Ribbons finding whose condition holds.

Pass if the report describes what the data did and explicitly avoids advice. Hedged,
observational framing is acceptable and expected.

Return status ("pass" | "fail") and failed_checks (each with the finding_id if identifiable,
the rule, and a one-line detail). Be specific and terse. Do not rewrite the report; only judge it.
`.trim(),
});
```

### src/daily-market-report.workflow.ts

```ts
// daily-market-report.workflow.ts
// Session 4 — wires the deterministic findings engine to a single LLM narration step and a
// compliance gate. Verified against @mastra/core 1.51.0:
//   createStep/createWorkflow, .then().commit(), execute({ inputData, mastra, suspend,
//   resumeData }), resumeSchema/suspendSchema, agent.generate(p,{structuredOutput}).object,
//   and the native `schedule` field (auto-promotes to the evented engine — see register.ts).

import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import {
  findingSchema,
  selectionSchema,
  narrationSchema,
  lintSchema,
  lexReviewSchema,
  reportResultSchema,
  approvalSuspendSchema,
  approvalResumeSchema,
  type Finding,
  type Selection,
} from './schemas';
import { runHouseStyle, summariseViolations } from './house-style-linter';

// ---- Session 1–3 boundary. These already exist; Session 4 only orchestrates them. -------
import { loadObservationBundle, insertMarketReport, logAgentActivity } from './data-access'; // S1
import { computeFindings } from './computors'; // S2 — pure fan-out over the type-computors
import { scoreAndSelect } from './materiality'; // S3 — materiality + selection + quiet floor
import { loadFindingConfig, loadActiveWatches } from './config'; // catalog + seed tables
// -----------------------------------------------------------------------------------------

const todayISO = () => new Date().toISOString().slice(0, 10);

// 1) LOAD — deterministic. Read the observation series for every stored/derived metric.
const loadSeriesStep = createStep({
  id: 'load-series',
  inputSchema: z.object({ as_of: z.string().optional() }),
  outputSchema: z.object({ as_of: z.string(), bundle: z.any() }),
  execute: async ({ inputData }) => {
    const as_of = inputData.as_of ?? todayISO();
    const bundle = await loadObservationBundle(as_of);
    return { as_of, bundle };
  },
});

// 2) COMPUTE — deterministic, NO LLM. One step calls all pure computors.
// Note: the six computors are pure functions; do NOT split them into parallel workflow
// steps. That only buys snapshot/serialisation overhead for zero concurrency benefit.
const computeFindingsStep = createStep({
  id: 'compute-findings',
  inputSchema: z.object({ as_of: z.string(), bundle: z.any() }),
  outputSchema: z.object({ as_of: z.string(), findings: z.array(findingSchema) }),
  execute: async ({ inputData }) => {
    const config = await loadFindingConfig();
    const findings = computeFindings(inputData.bundle, config); // Finding[]
    return { as_of: inputData.as_of, findings };
  },
});

// 3) SCORE + SELECT — deterministic. Materiality, top-K, quiet floor, watch boosts.
const scoreSelectStep = createStep({
  id: 'score-select',
  inputSchema: z.object({ as_of: z.string(), findings: z.array(findingSchema) }),
  outputSchema: z.object({ selection: selectionSchema }),
  execute: async ({ inputData }) => {
    const config = await loadFindingConfig();
    const watches = await loadActiveWatches();
    const selection: Selection = scoreAndSelect(inputData.findings, config, watches);
    return { selection: { ...selection, as_of: inputData.as_of } };
  },
});

// 4) NARRATE + LINT — the only LLM, immediately followed by the deterministic linter, with
// one bounded corrective pass. The narrator never sees anything but the selected findings.
const narrateStep = createStep({
  id: 'narrate',
  inputSchema: z.object({ selection: selectionSchema }),
  outputSchema: z.object({
    selection: selectionSchema,
    narration: narrationSchema,
    lint: lintSchema,
  }),
  execute: async ({ inputData, mastra }) => {
    const { selection } = inputData;
    const narrator = mastra.getAgent('market-narrator');
    const clientFindings: Finding[] = selection.findings;

    const basePrompt =
      `report_mode: ${selection.report_mode}\nas_of: ${selection.as_of}\n\n` +
      `findings:\n${JSON.stringify(clientFindings, null, 2)}`;

    let res = await narrator.generate(basePrompt, {
      structuredOutput: { schema: narrationSchema },
    });
    let narration = res.object;
    let lint = runHouseStyle(narration.report_markdown, clientFindings);

    // One corrective pass on hard violations only. If it still fails, hand it to the gate
    // (a human will see the flags) rather than looping the model indefinitely.
    if (!lint.pass) {
      res = await narrator.generate(
        `${basePrompt}\n\nYour previous draft failed these house-style checks. ` +
          `Rewrite to fix them and change nothing else:\n${summariseViolations(lint.violations)}\n\n` +
          `Previous draft:\n${narration.report_markdown}`,
        { structuredOutput: { schema: narrationSchema } },
      );
      narration = res.object;
      lint = runHouseStyle(narration.report_markdown, clientFindings);
    }

    return { selection, narration, lint };
  },
});

// 5) LEX GATE — semantic valuation-framing review + human sign-off via suspend/resume.
// Suspends (hands a Signal-ready payload to Simon) when a human is needed; resumes on reply.
const lexGateStep = createStep({
  id: 'lex-gate',
  inputSchema: z.object({
    selection: selectionSchema,
    narration: narrationSchema,
    lint: lintSchema,
  }),
  outputSchema: reportResultSchema,
  resumeSchema: approvalResumeSchema,
  suspendSchema: approvalSuspendSchema,
  execute: async ({ inputData, resumeData, suspend, mastra }) => {
    const { selection, narration, lint } = inputData;
    const hasValuationSensitive = selection.findings.some(
      (f) => f.compliance_class === 'valuation_sensitive',
    );

    // Semantic review only when there's something valuation-sensitive to judge.
    let lexReview = { status: 'pass' as const, failed_checks: [] as any[] };
    if (hasValuationSensitive) {
      const lex = mastra.getAgent('lex-report-reviewer');
      const prompt =
        `report_markdown:\n${narration.report_markdown}\n\n` +
        `findings:\n${JSON.stringify(selection.findings, null, 2)}`;
      const res = await lex.generate(prompt, { structuredOutput: { schema: lexReviewSchema } });
      lexReview = res.object as typeof lexReview;
    }

    const needsHuman =
      hasValuationSensitive || !lint.pass || lexReview.status === 'fail';

    // First pass and a human is required → suspend with the review packet for Simon.
    if (needsHuman && !resumeData) {
      const reasons = [
        hasValuationSensitive ? 'valuation-sensitive finding present' : null,
        !lint.pass ? 'house-style flags outstanding' : null,
        lexReview.status === 'fail' ? 'Lex flagged framing' : null,
      ].filter(Boolean);
      return await suspend({
        as_of: selection.as_of,
        report_markdown: narration.report_markdown,
        findings_used: narration.findings_used,
        reason: reasons.join('; '),
        lint_violations: lint.violations,
        lex_review: lexReview,
      });
    }

    // Resumed (human replied) or no human needed → settle the result.
    const approved = resumeData ? resumeData.approved : true;
    const finalMd = resumeData?.edited_markdown ?? narration.report_markdown;

    return {
      as_of: selection.as_of,
      report_mode: selection.report_mode,
      report_markdown: finalMd,
      findings_used: narration.findings_used,
      lex_result: {
        status: approved ? 'approved' : 'held',
        failed_checks: lexReview.failed_checks,
      },
    };
  },
});

// 6) PERSIST — deterministic. Write the report and log to agent_activity (proposed→approved).
const persistStep = createStep({
  id: 'persist',
  inputSchema: reportResultSchema,
  outputSchema: reportResultSchema,
  execute: async ({ inputData }) => {
    // Held reports are stored too, so the ops console shows what's awaiting sign-off.
    await insertMarketReport({
      as_of: inputData.as_of,
      status: inputData.lex_result.status,
      report_markdown: inputData.report_markdown,
      findings_used: inputData.findings_used,
      report_mode: inputData.report_mode,
    });
    await logAgentActivity({
      agent_name: 'findings-engine',
      action: inputData.lex_result.status === 'approved' ? 'approved' : 'proposed',
      trigger_type: 'scheduled',
      trigger_ref: `market-report:${inputData.as_of}`,
      proposed_actions: [{ type: 'market_report', findings: inputData.findings_used }],
    });
    return inputData;
  },
});

export const dailyMarketReport = createWorkflow({
  id: 'daily-market-report',
  inputSchema: z.object({ as_of: z.string().optional() }),
  outputSchema: reportResultSchema,
  // Native scheduler. 08:00 Melbourne — IANA tz handles AEST/AEDT. See register.ts for the
  // storage-adapter requirement this imposes.
  schedule: {
    cron: '0 8 * * *',
    timezone: 'Australia/Melbourne',
    inputData: {},
  },
})
  .then(loadSeriesStep)
  .then(computeFindingsStep)
  .then(scoreSelectStep)
  .then(narrateStep)
  .then(lexGateStep)
  .then(persistStep)
  .commit();
```

### src/register.ts

```ts
// register.ts
// Register the agents + workflow on the Mastra instance, and show how Simon resumes the
// suspended run when the human replies over Signal. Verified against @mastra/core 1.51.0.

import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg'; // concurrency-capable — required by the scheduler

import { dailyMarketReport } from './daily-market-report.workflow';
import { marketNarrator } from './market-narrator.agent';
import { lexReportReviewer } from './lex-report-reviewer.agent';

// IMPORTANT: declaring `schedule` on the workflow auto-promotes it to the evented execution
// engine, which needs a storage adapter that supports concurrent updates. LibSQL or Postgres
// qualify; the default in-memory store does not. You already run Postgres — point Mastra's
// store at it (this is Mastra's own snapshot/schedule storage, separate from your app's
// Supabase client and RLS-guarded tables).
export const mastra = new Mastra({
  storage: new PostgresStore({ connectionString: process.env.MASTRA_PG_URL! }),
  agents: { marketNarrator, lexReportReviewer },
  workflows: { dailyMarketReport },
});

// --- Resuming after human sign-off (called from Simon's inbound Signal handler) ----------
// When lex-gate suspends, persist the runId alongside the outbound Signal message so the
// reply can be routed back. On reply:
export async function resumeMarketReport(
  runId: string,
  approved: boolean,
  editedMarkdown?: string,
) {
  const workflow = mastra.getWorkflow('dailyMarketReport');
  // Re-hydrate the suspended run by id, then resume the last suspended step.
  const run = await workflow.createRun({ runId });
  const result = await run.resume({
    // step omitted: only one step suspends, so Mastra resumes the last suspended step.
    resumeData: { approved, edited_markdown: editedMarkdown },
  });
  return result;
}

// --- Manual/ad-hoc run (backfill a date, or trigger outside the schedule) -----------------
export async function runMarketReport(asOf?: string) {
  const workflow = mastra.getWorkflow('dailyMarketReport');
  const run = await workflow.createRun();
  return run.start({ inputData: { as_of: asOf } });
}

// Notes for Simon's suspend->Signal bridge:
// - The suspend payload (approvalSuspendSchema) is exactly the compliance packet: the draft,
//   the reason a human is needed, the outstanding lint flags, and Lex's framing verdict.
//   Compose the Signal message from it and stash { runId, as_of } so the reply resumes it.
// - A plain "approve" reply -> resumeMarketReport(runId, true).
//   A hand-edited reply     -> resumeMarketReport(runId, true, editedMarkdown).
//   A rejection             -> resumeMarketReport(runId, false)  (report is stored 'held').
// - If no reply by a cutoff, leave it suspended; the snapshot persists across restarts.
//   Do not auto-approve a valuation-sensitive report on a timer.
```
