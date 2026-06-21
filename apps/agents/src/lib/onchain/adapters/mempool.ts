/**
 * mempool.space adapter — free, keyless, JSON REST. Base https://mempool.space/api.
 *
 * One adapter, several endpoints selected by the requested registry keys:
 *   hash_rate / difficulty          → /v1/mining/hashrate/{period}
 *   next_difficulty_adjustment      → /v1/difficulty-adjustment
 *   pool_concentration_top          → /v1/mining/hashrate/pools/1m
 *   miner_fees_total / _revenue     → /v1/mining/reward-stats/{blockCount}
 *
 * THE CRITICAL NORMALISATION: raw hash rate is ~6e20 H/s, which exceeds
 * Number.MAX_SAFE_INTEGER (~9e15) and loses precision as a JS number. We divide
 * by 1e18 to EH/s (values land ~640) before emitting. Get this wrong and the
 * hash-rate series and its Hash-Ribbons moving averages are silently corrupted.
 *
 * Sats are converted to BTC (÷ 1e8). reward-stats is windowed by block count;
 * 144 blocks ≈ one day. Parse functions are pure and exported for fixture tests.
 *
 * See docs/features/onchain-indicators/adapter-contract.md.
 */

import type {
  AdapterError,
  AdapterResult,
  FetchOptions,
  OnchainAdapter,
  OnchainIndicatorConfig,
  RawObservation,
} from '../types.js';
import { utcDate } from '../types.js';

const BASE = 'https://mempool.space/api';
const HS_PER_EHS = 1e18; // H/s → EH/s
const SATS_PER_BTC = 1e8;
const REWARD_STATS_BLOCKS = 144; // ~one day of blocks; documented window for fee_share

// ── Pure parse steps (exported for fixture tests, no network) ─────────────────

interface HashrateResponse {
  currentHashrate?: number;
  currentDifficulty?: number;
  hashrates?: Array<{ timestamp?: number; avgHashrate?: number }>;
}

/** hash_rate emits a DAILY series from `hashrates` (one point per day) so the
 *  Hash-Ribbons moving averages have contiguous rows. difficulty (a raw input)
 *  emits today's currentDifficulty. */
export function parseHashrate(
  payload: unknown,
  opts: { backfillDays?: number; wantHashRate: boolean; wantDifficulty: boolean },
): AdapterResult {
  const r = payload as HashrateResponse;
  const out: RawObservation[] = [];

  if (opts.wantHashRate) {
    const series = r.hashrates;
    if (!Array.isArray(series) || series.length === 0) {
      return { ok: false, error: { kind: 'parse', message: 'mempool hashrate response missing hashrates series' } };
    }
    // One observation per UTC day, latest value wins for a given day.
    const byDay = new Map<string, RawObservation>();
    for (const point of series) {
      if (typeof point.timestamp !== 'number' || typeof point.avgHashrate !== 'number') continue;
      const day = utcDate(new Date(point.timestamp * 1000));
      byDay.set(day, {
        observedAt: day,
        key: 'hash_rate',
        value: point.avgHashrate / HS_PER_EHS,
        raw: point,
      });
    }
    let days = [...byDay.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    if (days.length === 0) {
      return { ok: false, error: { kind: 'parse', message: 'mempool hashrate series had no usable points' } };
    }
    // Steady runs only need the latest couple of days; backfill keeps everything.
    if (!opts.backfillDays) days = days.slice(-2);
    out.push(...days);
  }

  if (opts.wantDifficulty) {
    if (typeof r.currentDifficulty !== 'number') {
      return { ok: false, error: { kind: 'parse', message: 'mempool hashrate response missing currentDifficulty' } };
    }
    out.push({
      observedAt: utcDate(new Date()),
      key: 'difficulty',
      value: r.currentDifficulty,
      raw: { currentDifficulty: r.currentDifficulty },
    });
  }

  return { ok: true, observations: out };
}

interface DifficultyAdjustmentResponse {
  difficultyChange?: number;
  estimatedRetargetDate?: number;
  remainingBlocks?: number;
}

/** next_difficulty_adjustment = difficultyChange (forward estimate %). The
 *  retarget ETA fields are preserved in raw for the dashboard sub-line. */
export function parseDifficultyAdjustment(payload: unknown): AdapterResult {
  const r = payload as DifficultyAdjustmentResponse;
  if (typeof r.difficultyChange !== 'number') {
    return { ok: false, error: { kind: 'parse', message: 'mempool difficulty-adjustment missing difficultyChange' } };
  }
  return {
    ok: true,
    observations: [
      {
        observedAt: utcDate(new Date()),
        key: 'next_difficulty_adjustment',
        value: r.difficultyChange,
        raw: r,
      },
    ],
  };
}

interface PoolsResponse {
  pools?: Array<{ name?: string; share?: number; blockCount?: number }>;
}

/** pool_concentration_top = the top pool's share as a percent. Prefers an
 *  explicit `share` fraction; falls back to blockCount/total. */
export function parsePools(payload: unknown): AdapterResult {
  const r = payload as PoolsResponse;
  const pools = r.pools;
  if (!Array.isArray(pools) || pools.length === 0) {
    return { ok: false, error: { kind: 'parse', message: 'mempool pools response missing pools array' } };
  }

  let topPct: number | null = null;
  const haveShare = pools.some((p) => typeof p.share === 'number');
  if (haveShare) {
    const maxShare = Math.max(...pools.map((p) => (typeof p.share === 'number' ? p.share : 0)));
    topPct = maxShare * 100;
  } else {
    const total = pools.reduce((s, p) => s + (typeof p.blockCount === 'number' ? p.blockCount : 0), 0);
    if (total <= 0) {
      return { ok: false, error: { kind: 'parse', message: 'mempool pools response has no share or blockCount data' } };
    }
    const maxBlocks = Math.max(...pools.map((p) => (typeof p.blockCount === 'number' ? p.blockCount : 0)));
    topPct = (maxBlocks / total) * 100;
  }

  return {
    ok: true,
    observations: [
      {
        observedAt: utcDate(new Date()),
        key: 'pool_concentration_top',
        value: Math.round(topPct * 1e6) / 1e6,
        raw: { pools },
      },
    ],
  };
}

interface RewardStatsResponse {
  totalReward?: string | number;
  totalFee?: string | number;
}

/** miner_revenue_total / miner_fees_total in BTC (sats ÷ 1e8). The view derives
 *  fee_share = fees / revenue. */
export function parseRewardStats(
  payload: unknown,
  opts: { wantRevenue: boolean; wantFees: boolean },
): AdapterResult {
  const r = payload as RewardStatsResponse;
  const out: RawObservation[] = [];
  const today = utcDate(new Date());

  const toBtc = (v: string | number | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(v);
    return Number.isFinite(n) ? n / SATS_PER_BTC : NaN;
  };

  if (opts.wantRevenue) {
    const btc = toBtc(r.totalReward);
    if (btc == null || Number.isNaN(btc)) {
      return { ok: false, error: { kind: 'parse', message: 'mempool reward-stats missing/invalid totalReward' } };
    }
    out.push({ observedAt: today, key: 'miner_revenue_total', value: btc, raw: { totalReward: r.totalReward } });
  }
  if (opts.wantFees) {
    const btc = toBtc(r.totalFee);
    if (btc == null || Number.isNaN(btc)) {
      return { ok: false, error: { kind: 'parse', message: 'mempool reward-stats missing/invalid totalFee' } };
    }
    out.push({ observedAt: today, key: 'miner_fees_total', value: btc, raw: { totalFee: r.totalFee } });
  }

  return { ok: true, observations: out };
}

// ── Fetch orchestration ───────────────────────────────────────────────────────

async function getJson(url: string): Promise<{ ok: true; payload: unknown } | { ok: false; error: AdapterError }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { ok: false, error: { kind: 'transport', message: err instanceof Error ? err.message : String(err) } };
  }
  if (!res.ok) {
    const kind = res.status === 429 ? 'rate_limit' : res.status === 404 ? 'not_found' : 'transport';
    return { ok: false, error: { kind, message: `mempool HTTP ${res.status}`, status: res.status } };
  }
  try {
    return { ok: true, payload: await res.json() };
  } catch (err) {
    return { ok: false, error: { kind: 'parse', message: err instanceof Error ? err.message : 'mempool JSON parse failed' } };
  }
}

export const mempoolAdapter: OnchainAdapter = {
  provider: 'mempool',

  async fetchLatest(indicators: OnchainIndicatorConfig[], opts?: FetchOptions): Promise<AdapterResult> {
    const keys = new Set(indicators.map((i) => i.key));
    const observations: RawObservation[] = [];
    const errors: AdapterError[] = [];

    const want = (k: string) => keys.has(k);
    const absorb = (res: AdapterResult) => {
      if (res.ok) observations.push(...res.observations);
      else errors.push(res.error);
    };

    // hashrate endpoint (covers hash_rate + difficulty)
    if (want('hash_rate') || want('difficulty')) {
      const period = opts?.backfillDays ? '3m' : '1m';
      const r = await getJson(`${BASE}/v1/mining/hashrate/${period}`);
      if (r.ok) {
        absorb(parseHashrate(r.payload, {
          backfillDays: opts?.backfillDays,
          wantHashRate: want('hash_rate'),
          wantDifficulty: want('difficulty'),
        }));
      } else errors.push(r.error);
    }

    if (want('next_difficulty_adjustment')) {
      const r = await getJson(`${BASE}/v1/difficulty-adjustment`);
      if (r.ok) absorb(parseDifficultyAdjustment(r.payload));
      else errors.push(r.error);
    }

    if (want('pool_concentration_top')) {
      const r = await getJson(`${BASE}/v1/mining/hashrate/pools/1m`);
      if (r.ok) absorb(parsePools(r.payload));
      else errors.push(r.error);
    }

    if (want('miner_revenue_total') || want('miner_fees_total')) {
      const r = await getJson(`${BASE}/v1/mining/reward-stats/${REWARD_STATS_BLOCKS}`);
      if (r.ok) {
        absorb(parseRewardStats(r.payload, {
          wantRevenue: want('miner_revenue_total'),
          wantFees: want('miner_fees_total'),
        }));
      } else errors.push(r.error);
    }

    // Degrade gracefully: only fail the whole provider when nothing was gathered.
    if (observations.length === 0 && errors.length > 0) {
      return { ok: false, error: errors[0] };
    }
    return { ok: true, observations };
  },
};
