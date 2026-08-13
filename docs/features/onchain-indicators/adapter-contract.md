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

> Verify endpoints, field names and free-tier limits against live docs at build. Four providers need
> **no API key** — mempool.space, Coin Metrics community, CoinGecko, alternative.me; two do —
> BGeometrics (`BGEOMETRICS_API_KEY`) and SoSoValue (`SOSOVALUE_API_KEY`). Series/metric availability
> for Coin Metrics community must be confirmed via its catalog (`community: true` per metric) — see
> assumptions.

### mempool.space — `apps/agents/.../adapters/mempool.ts`

Free, keyless, JSON REST. Base `https://mempool.space/api`. One adapter, several endpoints by key:

- **`hash_rate`** → `GET /v1/mining/hashrate/{period}` — `1m` on a steady poll, `3m` when backfilling.
  Response carries `currentHashrate` (H/s) and a `hashrates` series. **Emit `÷ 1e18` as EH/s.** As
  shipped this emits a DAILY series off `hashrates` (one point per UTC day, latest wins), not the
  single `currentHashrate` — Hash Ribbons needs contiguous daily rows for its ROWS-based moving
  averages. A steady run keeps only the last two days; a backfill keeps everything.
- **`difficulty`** / **`next_difficulty_adjustment`** → `GET /v1/difficulty-adjustment`. Returns
  `difficultyChange` (the forward estimate %, → `next_difficulty_adjustment`), plus retarget date
  and remaining blocks (use for the ETA sub-line). Current difficulty is in the hashrate response.
- **`pool_concentration_top`** → `GET /v1/mining/hashrate/pools/1m`. Returns each pool's `share`
  (fraction). Emit the max share × 100 as a percent; an `Unknown` bucket exists — handle it.
- **`miner_revenue_total`** / **`miner_fees_total`** → `GET /v1/mining/reward-stats/[blockCount]`
  (last 144 blocks ≈ a day — the shipped window) returns `totalReward` and `totalFee` in sats. Emit
  both (the view derives `fee_share`). **Settled: sats → BTC, ÷ 1e8.** Both arrive as strings or
  numbers; `parseFloat` either way.
- **`block_height`** → `GET /blocks/tip/height`. Mainnet tip, point-in-time. **Returns a bare
  integer as plain text, not JSON** — it is the one endpoint here read with `res.text()`, and
  `res.json()` on it throws. Added by `20260704160000_add_bitcoin_snapshot_indicators.sql`.

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

**Update 2026-07-30:** `CapRealUSD` was never actually community-entitled — confirmed via
production data (zero observations ever, vs. ~36,000 for `SplyCur`/`AdrActCnt` on the same batched
call). `realised_cap` has moved off this adapter onto BGeometrics below; `mvrv` and `supply` /
`active_addresses` are unaffected. See `20260730120000_realised_cap_bgeometrics_source.sql`.

### CoinGecko — `apps/agents/.../adapters/coingecko.ts`

Free, keyless, JSON REST. One endpoint, one call, point-in-time (dated today):

```
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=aud
```

- **`btc_price_aud`** ← `bitcoin.aud`
- **`btc_price_usd`** ← `bitcoin.usd`

Both are plain numbers in the response — no normalisation, the registry unit is the currency itself.
The requested `vs_currencies` are assembled from the keys handed in, so one call covers whichever
subset is due.

*The rule that keeps this adapter honest:* **emission is driven by the requested keys, not by the
response.** The response always carries every currency asked for, so mapping the payload instead
would double-write the USD series — `btc_price_usd`'s canonical source is Coin Metrics `PriceUSD`
(it feeds MVRV and the whole `v_btc_trend` ladder), and the on-chain poll only ever asks CoinGecko
for `btc_price_aud`. The `market_report` routine separately reuses this adapter to live-fetch
`btc_price_usd` for its Bitcoin snapshot section, which is display-only and stores nothing.

*Gotchas:* a missing currency in the payload is a `parse` error, not a zero. Called with no configs
at all the adapter defaults to `btc_price_aud` — defensive only; the poll always passes its configs.
The free tier is rate-limited per IP (and CoinGecko has tightened it more than once); one daily poll
plus one report fetch is far inside it, but it is the provider most likely to start answering 429,
which arrives as a typed `rate_limit` error.

### alternative.me — `apps/agents/.../adapters/alternativeMe.ts`

Free, keyless, JSON REST. One endpoint, one metric, point-in-time (dated today):

```
GET https://api.alternative.me/fng/?limit=1
```

- **`fear_greed`** ← `data[0].value` — the Crypto Fear & Greed Index, 0–100.

The value arrives as a **string**; `Number()` it, and treat a missing or non-numeric `data[0].value`
as a `parse` error rather than a zero (0 is a meaningful reading on this scale — "Extreme Fear").
`data[0].value_classification` ("Greed", "Extreme Fear", …) is kept in `raw` as `{ classification }`,
falling back to `'Unknown'` rather than failing the parse — the number is the metric, the label is
decoration. The market report reads that label off `raw` and renders it as the item's signal chip,
but only on its LIVE path: when the live fetch fails and the report falls back to the stored
observation, the value survives and the chip does not (`onchain_observations.raw` keeps it, nothing
reads it back out).

*Gotchas:* this adapter ignores the indicators array entirely and always emits `fear_greed` — it is
single-metric by construction, unlike every other adapter here. The index is **market-wide crypto
sentiment**, not Bitcoin-specific, though it is the de facto Bitcoin gauge; keep that in mind before
any content framing leans on it. It updates once daily, so a more frequent poll would restate the
same number under a new date. Mirrors apps/web's `FearGreedIndicator` dashboard widget, which hits
the same endpoint — the two should agree.

### BGeometrics — `apps/agents/.../adapters/bgeometrics.ts`

Free, JSON REST, self-serve API key (no card) at `portal.bgeometrics.com` — needs
`BGEOMETRICS_API_KEY` set. Fetches `realised_cap` only (one metric, one call, full history returned
per request — no date-range params needed):

```
GET https://api.bgeometrics.com/v1/realized-cap?token=...
```

*Response shape not hand-verified* — no network egress from the environment this was written in
(same situation as the Gold API fix, `20260729130000_gold_price_gold_api_source.sql`). Best-guess
shape: an array of `{ d: "YYYY-MM-DD", realizedCap: "<number>" }` rows. The parser fails loudly —
raw body attached — on anything else, so a wrong guess surfaces via the failed poll rather than
silently storing garbage; correct the field names in `bgeometrics.ts` from the real error on first
live run if needed.

### SoSoValue — `apps/agents/.../adapters/sosovalue.ts`

JSON REST, API key from `sosovalue.com` — needs `SOSOVALUE_API_KEY` set. The one provider here whose
metrics are **not on-chain data**: US spot ETF fund flows, riding these tables for the machinery
only (see `20260810000000_add_etf_flow_indicators.sql`). Two endpoints, both `POST` with body
`{"type":"us-btc-spot"}` and header `x-soso-api-key`, because the two metrics are shaped differently:

```
POST https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart   → etf_net_flow
POST https://api.sosovalue.xyz/openapi/v2/etf/currentEtfDataMetrics   → etf_net_assets
```

- **`etf_net_flow`** ← `totalNetInflow` per session. Full history in one call (no date-range params),
  so backfill and steady polls are identical — supersession dedupes. **Emit ÷ 1e6 as USD millions.**
- **`etf_net_assets`** ← `totalNetAssets`. Point-in-time: one observation per poll, dated by the
  payload's own as-at date, so this series accumulates a day at a time rather than backfilling.
  **Emit ÷ 1e9 as USD billions.**
- **`etf_flow_streak`** is derived in `v_etf_flow_streak` — no adapter involvement.

Both scale factors come off the indicator's `unit`, per the normalisation rule above; the registry
stores these scaled rather than in raw dollars because nothing in the stack has a compact number
formatter. The two endpoints fail independently: a partial failure returns what landed and logs,
rather than taking the healthy series down with it. Only a total failure is an adapter error.

*Response shape not hand-verified* — same situation as BGeometrics above. Best-guess shape: a
`{ code, data, msg }` envelope wrapping either an array of `{ date, totalNetInflow }` rows or an
object carrying `totalNetAssets` and an as-at date, numbers possibly arriving as strings. A non-zero
envelope `code` is treated as an API-level failure, not data (that is how a bad key arrives — HTTP
200 with an error body). *Gotcha the parser cannot catch:* if the API already returns millions, the
divisors make every figure 1e6 too small and still parse. Eyeball the first live poll against
sosovalue.com. Second gotcha: this is a **trading-day** series — no weekend or US-holiday rows,
which is why the `etf_*` keys carry the session-cadence staleness tolerance rather than the 2-day
daily default.

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
