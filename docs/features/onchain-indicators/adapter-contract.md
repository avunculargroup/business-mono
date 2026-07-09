# Feature Spec — On-Chain Indicators: Provider Adapter Contract

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** On-Chain Indicators — the ingest seam
**Status:** Draft
**Last updated:** 2026-06-21
**Companion to:** [`feature-spec.md`](./feature-spec.md), [`sql/seed.sql`](./sql/seed.sql)

-----

## Purpose

Define the seam both providers cross so mempool.space and Coin Metrics can be built and tested
independently against one shape. Same rules as the macro feature's contract: **adapters fetch and
parse only — no database, no Mastra, no derived-metric math.** Supersession lives in the workflow;
derivation lives in the views. An adapter is a pure function from indicator config to normalised
observations, testable against a recorded fixture.

The shape is simpler than the macro one because on-chain data has **no period-vs-release gap** —
`observedAt` is just the day the value pertains to.

-----

## The Contract

```ts
// ── What every adapter returns, per observation ──────────────
interface RawObservation {
  /** The day the value pertains to. ISO 'YYYY-MM-DD'. */
  observedAt: string;
  /** The indicator this value is for, by registry key (one fetch can yield many). */
  key: string;
  /** The value, already normalised to the indicator's unit (e.g. hash rate in EH/s, not H/s). */
  value: number;
  /** The provider payload slice this came from — lands in onchain_observations.raw. */
  raw: unknown;
}

// ── The registry fields an adapter needs ─────────────────────
interface OnchainIndicatorConfig {
  key: string;
  provider: 'mempool' | 'coinmetrics';
  providerMetricCode: string | null;   // CM metric id; null where the endpoint implies it
  unit: string;                         // drives normalisation (eh_s, usd, ratio, count, percent)
}

// ── Result wrapper: adapters never throw across the seam ──────
type AdapterResult =
  | { ok: true;  observations: RawObservation[] }
  | { ok: false; error: AdapterError };

interface AdapterError {
  kind: 'transport' | 'parse' | 'not_found' | 'rate_limit';
  message: string;
  status?: number;
}

// ── The one method ───────────────────────────────────────────
interface OnchainAdapter {
  readonly provider: 'mempool' | 'coinmetrics';
  /** Fetch the latest available observation(s). May return many keys at once
   *  (especially Coin Metrics, which batches metrics in a single request).
   *  Returns ok:true with [] when nothing is new — a no-op, not an error. */
  fetchLatest(indicators: OnchainIndicatorConfig[]): Promise<AdapterResult>;
}
```

Note the method takes an **array** of indicator configs, not one. That's deliberate — Coin Metrics
returns many metrics per request, so the workflow hands each adapter all of its due indicators and
lets the adapter batch. The macro contract fetched one series per call; here, batching is the point.

-----

## Cross-cutting rules

### Normalise to the indicator's unit — especially hash rate

Hash rate in raw H/s is on the order of `6e20`, which **exceeds `Number.MAX_SAFE_INTEGER` (~9e15)**.
Passing raw H/s through a JS `number` silently loses precision. The mempool adapter **divides to
EH/s** (÷ 1e18) before emitting, so values land around `640` — comfortably precise. This is the
single most important normalisation in this feature; get it wrong and the hash-rate series and its
Hash-Ribbons MAs are subtly garbage. USD metrics (realised cap ~1e12) are within safe range but are
stored `NUMERIC(24,6)`; ratios and percents pass through.

### No `observedAt` fallback needed

Unlike the macro feature, there's no missing release date to substitute — on-chain values are
same-day. The adapter emits the day the data pertains to (UTC date of the latest complete day, or
the day Coin Metrics stamps). Keep it simple and consistent: **UTC calendar date.**

-----

## Per-provider mapping

> Verify endpoints, field names and free-tier limits against live docs at build. mempool.space and
> Coin Metrics community both require **no API key**. Series/metric availability for Coin Metrics
> community must be confirmed via its catalog (`community: true` per metric) — see assumptions.

### mempool.space — `apps/agents/.../adapters/mempool.ts`

Free, keyless, JSON REST. Base `https://mempool.space/api`. One adapter, several endpoints by key:

- **`hash_rate`** → `GET /v1/mining/hashrate/3d` (or `/1m` for context). Response carries
  `currentHashrate` (H/s) and a `hashrates` series. **Emit `currentHashrate ÷ 1e18` as EH/s.**
- **`difficulty`** / **`next_difficulty_adjustment`** → `GET /v1/difficulty-adjustment`. Returns
  `difficultyChange` (the forward estimate %, → `next_difficulty_adjustment`), plus retarget date
  and remaining blocks (use for the ETA sub-line). Current difficulty is in the hashrate response.
- **`pool_concentration_top`** → `GET /v1/mining/hashrate/pools/1m`. Returns each pool's `share`
  (fraction). Emit the max share × 100 as a percent; an `Unknown` bucket exists — handle it.
- **`miner_revenue_total`** / **`miner_fees_total`** → `GET /v1/mining/reward-stats/[blockCount]`
  (e.g. last ~144 blocks ≈ a day) returns `totalReward` and `totalFee` in sats. Emit both (the
  view derives `fee_share`). Convert sats→BTC or keep sats consistently; document which.

*Gotchas:* the hashrate overflow above; pool attribution drifts as pools rebrand; `reward-stats`
is block-count-windowed, so pick a window that approximates a day and document it. mempool.space is
generous but be polite — one daily poll is nothing.

### Coin Metrics community — `apps/agents/.../adapters/coinmetrics.ts`

Free, keyless, JSON REST. Base `https://community-api.coinmetrics.io/v4` — the keyless community endpoint (the bare `api.coinmetrics.io` host is the authenticated Pro API and answers 401 to keyless requests). **Batch everything in one request:**

```
GET /timeseries/asset-metrics
    ?assets=btc
    &metrics=CapMVRVCur,CapRealUSD,SplyCur,AdrActCnt
    &frequency=1d
    &page_size=1
```

- **`mvrv`** ← `CapMVRVCur` (ratio, fetched directly — not derived)
- **`realised_cap`** ← `CapRealUSD` (USD)
- **`supply`** ← `SplyCur` (BTC) — raw input for realised price
- **`active_addresses`** ← `AdrActCnt` (count)

Map each returned metric to its registry `key`. The community tier is rate-limited to **~1.6
requests/second per IP** (10 per 6s) — a once-daily batched call is trivially within budget. Values
arrive as strings; `parseFloat`, and treat a missing/empty metric as `not_found` for that key, not
a zero.

*Gotchas:* confirm each metric shows `community: true` in the CM catalog before relying on it
(MVRV/realised cap/active addresses are expected in community, but verify — see assumptions).
Coin Metrics serves a same-day **flash** value that may later revise; accept it and let the
workflow's supersession catch the revision (or request reviewed values at a lag — Open Question).

-----

## How the workflow consumes a result

Per provider, hand the adapter all of that provider's due indicators:

1. `adapter.fetchLatest(configs)`.
2. Branch:
   - `ok: true, observations: [...]` → for each, run the supersession rules from the feature spec
     (insert / supersede / no-op).
   - `ok: true, observations: []` → no-op; log `no_new_data`.
   - `ok: false` → log the `AdapterError` to `agent_activity`, **continue** — one dead provider
     doesn't sink the other.
3. After all fetched rows land, evaluate `alert_config` against the **derived views** (Hash-Ribbons
   signal change, MVRV band cross, hash-rate drop), and propose beats behind the publish wall.

Derived metrics are **never** computed in adapters or the workflow's storage path — only in
`views.sql`. The workflow reads the views for alerting; it does not write derived values.

> Wiring into Mastra: read the `mastra` skill and verify `createWorkflow` / `createStep` signatures
> against the installed version. The adapters are framework-agnostic plain TS so they unit-test with
> fixtures outside Mastra.

-----

## Testability

- Record one real response per endpoint into fixtures (`mempool-hashrate.json`,
  `mempool-difficulty-adjustment.json`, `coinmetrics-batch.json`).
- Assert the mapping: correct `key`, `observedAt` as a UTC date, **hash rate normalised to EH/s**,
  ratios/counts intact, `raw` preserved.
- Add malformed fixtures (a `null` metric from CM, an overflow-sized hash rate, a missing pool
  bucket) and assert `ok: false` with the right `error.kind` rather than a thrown exception or a
  precision-lost number.

-----

## Open Questions

- **`reward-stats` window.** Which block count best approximates a daily fee/revenue figure, and is
  block-count or a fixed UTC-day boundary the better unit? Pick one and document it so `fee_share`
  is stable day to day.
- **Adapter registry.** A `Record<provider, OnchainAdapter>` keyed off `indicator.provider`, same as
  the macro feature — noted so it isn't reinvented as a switch.
- **Backfill.** Hash Ribbons needs 60 days of hash-rate history to mean anything, and the deltas
  need yesterday. First ingest should backfill ~90 days of the fetched series (mempool and CM both
  serve history) so the views aren't empty on day one.
