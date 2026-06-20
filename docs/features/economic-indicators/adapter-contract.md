# Feature Spec — Economic Indicators: Provider Adapter Contract

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Economic Indicators (Macro Series) — the ingest seam
**Status:** Draft
**Last updated:** 2026-06-20
**Companion to:** [`feature-spec.md`](./feature-spec.md), [`sql/seed.sql`](./sql/seed.sql)

-----

## Purpose

Define the single seam every provider crosses, so FRED, RBA and ABS can be built, tested and replaced independently without the ingest workflow knowing or caring which one it's talking to. The workflow speaks one language; each adapter translates one provider into it.

**The hard rule: adapters fetch and parse. They do not touch the database.** Diffing, supersession and the `(indicator_id, period_date, released_at)` revision logic all live in the workflow (already specced). An adapter is a pure function from `IndicatorConfig` to normalised observations — which means it's testable against a recorded fixture with no Supabase, no Mastra, no network. That separation is the whole point of writing this down first.

-----

## The Contract

```ts
// ── What every adapter returns, per observation ──────────────
// This is the normalised shape. The DB columns period_date / value /
// released_at / raw map 1:1 onto it.
interface RawObservation {
  /** Reference period the figure pertains to. ISO 'YYYY-MM-DD',
   *  normalised to the FIRST day of the period (see "Period normalisation"). */
  periodDate: string;

  /** The figure. Plain float64 — safe for these magnitudes
   *  (AU broad money ~ a few thousand AUD-billion is nowhere near
   *  Number.MAX_SAFE_INTEGER). DB stores NUMERIC(18,4). */
  value: number;

  /** When the PROVIDER published this value. ISO 'YYYY-MM-DD', or null
   *  if the provider doesn't expose it (RBA CSV, most ABS). The WORKFLOW
   *  supplies the fallback — see "The released_at fallback". */
  releasedAt: string | null;

  /** The provider payload slice this observation was parsed from.
   *  Lands in indicator_observations.raw for audit and re-parse. */
  raw: unknown;
}

// ── The fields an adapter needs off the registry row ─────────
interface IndicatorConfig {
  id: string;
  provider: 'fred' | 'rba' | 'abs';
  providerSeriesCode: string | null;   // FRED series_id
  providerTableRef: string | null;     // RBA table / ABS dataflow
  // ...plus the rest of the economic_indicators row if needed
}

// ── Result wrapper: adapters never throw across the seam ──────
// One failing provider must not abort the daily sweep. Adapters
// return a typed result; the workflow logs and moves on.
type AdapterResult =
  | { ok: true;  observations: RawObservation[] }
  | { ok: false; error: AdapterError };

interface AdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit';
  message: string;
  status?: number;        // HTTP status where relevant
}

// ── The one method ───────────────────────────────────────────
interface ProviderAdapter {
  readonly provider: 'fred' | 'rba' | 'abs';

  /** Fetch the latest available observation(s) for this indicator.
   *  Returns an ARRAY because a single poll may surface more than one
   *  new period (a missed month, or a first-ever backfill window).
   *  Returns ok:true with [] when there is simply nothing new —
   *  that is a no-op, not an error. */
  fetchLatest(indicator: IndicatorConfig): Promise<AdapterResult>;
}
```

That's the entire surface. Everything below is how each provider fills it and where the bodies are buried.

-----

## Two cross-cutting rules

### The `released_at` fallback

`releasedAt` is the load-bearing distinction from the main spec (period vs release), and it's exactly the field providers are stingy with:

| Provider | Gives a release date? | Adapter emits | Workflow does |
|----------|----------------------|---------------|---------------|
| FRED | Yes (via ALFRED `realtime_start`) — but **deferred in v1** | `null` in v1 | falls back to fetch date |
| RBA | No (CSV carries no release date) | `null` | falls back to fetch date |
| ABS | Not cleanly per-observation | `null` | falls back to fetch date |

So in v1 **every adapter emits `releasedAt: null`**, and the workflow substitutes the fetch date (today, AEST). This is not a fudge — it's coherent with the revision model. When RBA revises a figure and a re-fetch returns a different value, the new row's `released_at` becomes today, which is genuinely when *you* learned of the revision. The `(indicator_id, period_date, released_at)` uniqueness still holds and supersession still fires correctly.

The ALFRED upgrade (real vintage dates from FRED) slots in later by having the FRED adapter populate `releasedAt` for real — no contract change, no workflow change. That's the forward-only-in-v1 decision from the main spec, honoured at the seam.

### Period normalisation — pick one convention and enforce it everywhere

Providers disagree on how to stamp a period. FRED dates monthly series to the first of the month; RBA dates to end-of-month; ABS uses `2026-Q1`. If adapters pass these through raw, the `v_indicator_latest` prior/YoY joins (which match on `period_date`) silently misalign across series.

**Rule: every adapter normalises `periodDate` to the FIRST day of the reference period.**

- Monthly → first of that month (`2026-03-01`)
- Quarterly → first of that quarter (`2026-Q1` → `2026-01-01`)

Uniform period stamps are what let "the observation 12 periods back" be a clean join rather than a per-provider special case.

-----

## Per-provider mapping

> Verify every endpoint, parameter and free-tier rate limit against live docs at build — these are external services. The FRED *series codes* are stable (see [`sql/seed.sql`](./sql/seed.sql)); the *request shapes* below are the v1 intent, not gospel.

### FRED — `apps/agents/.../adapters/fred.ts`

The easy one. JSON, one request, well-behaved.

- **Endpoint:** `GET https://api.stlouisfed.org/fred/series/observations`
- **Params:** `series_id={providerSeriesCode}`, `api_key`, `file_type=json`, `sort_order=desc`, `limit` (small — 6 is plenty for "latest + a little history").
- **periodDate:** the observation `date` (already first-of-month) — pass through normalisation as a no-op.
- **value:** returned as a **string**; missing values are the literal `"."`. Filter out `"."`, then `parseFloat`. Emitting a `NaN` is a `parse` error, not a silent zero.
- **releasedAt:** `null` in v1. (ALFRED `realtime_start`/`realtime_end` is the later upgrade.)
- **Gotcha:** the most-recent row can legitimately be `"."` (not yet published). Walk back to the latest real value; don't assume row[0] is populated.

### RBA — `apps/agents/.../adapters/rba.ts`

The fiddly one. No API — you fetch a statistical-table CSV and parse it.

- **Endpoint:** the table CSV, e.g. `https://www.rba.gov.au/statistics/tables/csv/{table}-data.csv` where `{table}` derives from `providerTableRef` (`f1.1`, `d3`).
- **Shape:** a multi-row header block (title, description, frequency, source, mnemonic rows) **then** data rows. Row 0 is not the header — the adapter must skip the preamble and locate the data grid.
- **Column selection:** the data section is wide (D3 carries M1, M3, Broad money, Money base). The adapter selects the target column by matching the header/mnemonic text — **confirm the exact column label against the live CSV** (flagged in the seed file). Hard-coding a column index is fragile; match on the label.
- **periodDate:** the first column is the date, typically end-of-month, formatted like `31-Jan-2026` (parse, then normalise to first-of-month).
- **value:** parse the cell; blanks/`""` mean no observation for that period — skip, don't zero.
- **releasedAt:** `null`.
- **Gotcha:** RBA occasionally restructures column order between table revisions. Label-matching survives this; index-matching doesn't. This adapter is where the build time goes — budget for it.

### ABS — `apps/agents/.../adapters/abs.ts` — DEFERRED

Built only when the AU CPI row flips `is_active = true`. Sketch so the seam is reserved:

- **Endpoint:** ABS Data API (SDMX), `GET https://data.api.abs.gov.au/rest/data/{dataflow}/{datakey}` with a JSON `Accept` header / `format` param. `{dataflow}` from `providerTableRef`.
- **Shape:** SDMX-JSON — dimensions and observations are index-keyed arrays you cross-reference against the structure block. Genuinely clunky; this is why it's deferred.
- **periodDate:** from the `TIME_PERIOD` dimension (`2026-Q1`) → normalise to first-of-quarter.
- **releasedAt:** `null`.
- **Escape hatch:** if SDMX parsing isn't worth it, the seed file notes the FRED OECD mirror `AUSCPIALLQINMEI` — which would make this a FRED adapter call instead, no ABS code at all. Decide before building, not during.

-----

## How the workflow consumes a result

Per indicator due for polling (one step, looping or fanned out):

1. Call `adapter.fetchLatest(indicator)`.
2. Branch on the result:
   - `ok: true, observations: [...]` → for each obs, apply the `released_at` fallback if `null`, then run the diff/supersede rules from the main spec (insert / supersede / no-op).
   - `ok: true, observations: []` → no-op. Log to `agent_activity` as `no_new_data` so quiet days are still on the record.
   - `ok: false` → log to `agent_activity` with the `AdapterError`, **continue the sweep**. One dead provider doesn't sink the others.
3. If any insert happened and the indicator's alert rules fire, propose the content beat (pending, behind the publish wall — agents propose, never publish).

The revision rules themselves aren't repeated here — they're in [`feature-spec.md`](./feature-spec.md) under `indicator_observations`. This document only defines what crosses the seam.

> When wiring this into the Mastra workflow, read the `mastra` skill and confirm the current step / `createStep` / error-propagation signatures against the installed version. The adapters above are deliberately framework-agnostic plain TS so they can be unit-tested with fixtures outside Mastra entirely; only the orchestration is Mastra's concern.

-----

## Testability

Because adapters are pure fetch-and-parse with a typed result, each gets a fixture-based unit test with zero infrastructure:

- Record one real provider response per adapter into a fixture (`__fixtures__/fred-m2sl.json`, `rba-d3.csv`, etc.).
- Assert the adapter maps it to the expected `RawObservation[]` — correct `periodDate` normalisation, correct `value` parse, `releasedAt: null`, `raw` preserved.
- Add a malformed fixture per adapter (FRED `"."` row, RBA blank cell, truncated CSV) and assert it returns `ok: false` with the right `error.kind` rather than throwing or emitting `NaN`.

That fixture suite is the regression net for the one thing most likely to rot: a provider quietly changing its response shape.

-----

## Open Questions

- **Backfill window on first ingest.** `fetchLatest` returning an array supports pulling N historical periods the first time an indicator is seen, so the sparkline isn't empty on day one. How many periods? Suggest 12–24 so YoY works immediately. Confirm per `category` (quarterly CPI needs fewer rows than monthly M2 for the same time span).
- **RBA fetch politeness.** The CSVs are static files; a daily GET is harmless, but set a real User-Agent and cache the ETag to avoid re-parsing an unchanged file. Minor, but cheap manners.
- **Adapter registry wiring.** A `Record<provider, ProviderAdapter>` lookup keyed off `indicator.provider` keeps the workflow free of provider conditionals. Trivial, noted so it doesn't get reinvented as a switch statement.
