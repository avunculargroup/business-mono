import { createClient } from '@/lib/supabase/server';

export type BtcCurrency = 'aud' | 'usd';

/** A live spot price (with 24h change) or the last-known stored poll value. */
export type BtcPrice =
  | { source: 'live'; price: number; change24h: number | null }
  | { source: 'cache'; price: number; observedAt: string };

/** onchain_indicators.key backing each currency's last-known price. The daily
 *  on-chain poll stores both series: btc_price_usd comes from Coin Metrics — a
 *  different provider than the live CoinGecko call, so it survives a CoinGecko
 *  outage — while btc_price_aud is CoinGecko's own last good poll. */
const INDICATOR_KEY: Record<BtcCurrency, string> = {
  aud: 'btc_price_aud',
  usd: 'btc_price_usd',
};

interface SimplePriceResponse {
  bitcoin?: Record<string, number>;
}

/** Vercel captures console output per line — there is no pino logger on the web
 *  side (that convention is apps/agents only, for Railway). Gated off in tests. */
function logFailure(currency: BtcCurrency, reason: string): void {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[btcPrice:${currency}] live price unavailable — ${reason}`);
  }
}

/** Live spot price + 24h change from CoinGecko. Returns null (and logs the
 *  reason) on any failure so the caller can fall back to the stored series. */
async function fetchLive(
  currency: BtcCurrency,
): Promise<{ price: number; change24h: number | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency}&include_24hr_change=true`,
      { signal: controller.signal, next: { revalidate: 60 } },
    );
    if (!res.ok) {
      logFailure(currency, `CoinGecko HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as SimplePriceResponse;
    const price = json.bitcoin?.[currency];
    if (typeof price !== 'number' || Number.isNaN(price)) {
      logFailure(currency, 'CoinGecko response missing price');
      return null;
    }
    const change = json.bitcoin?.[`${currency}_24h_change`];
    const change24h = typeof change === 'number' && !Number.isNaN(change) ? change : null;
    return { price, change24h };
  } catch (err) {
    logFailure(currency, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Last-known price from the daily on-chain poll — the fallback when the live
 *  CoinGecko call fails. Reads the most recent current observation. */
async function fetchCached(
  currency: BtcCurrency,
): Promise<{ price: number; observedAt: string } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('v_onchain_series')
      .select('value, observed_at')
      .eq('key', INDICATOR_KEY[currency])
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logFailure(currency, `cache lookup failed — ${error.message}`);
      return null;
    }
    if (!data || data.value == null || !data.observed_at) return null;
    return { price: Number(data.value), observedAt: data.observed_at };
  } catch (err) {
    logFailure(currency, `cache lookup threw — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Live price if CoinGecko answers, else the last stored poll value, else null. */
export async function getBtcPrice(currency: BtcCurrency): Promise<BtcPrice | null> {
  const live = await fetchLive(currency);
  if (live) return { source: 'live', price: live.price, change24h: live.change24h };

  const cached = await fetchCached(currency);
  if (cached) return { source: 'cache', price: cached.price, observedAt: cached.observedAt };

  return null;
}
