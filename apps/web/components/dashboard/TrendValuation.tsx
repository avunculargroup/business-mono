import styles from './OnchainIndicators.module.css';
import { OnchainCard } from './OnchainCard';
import type { OnchainDashboardRow, OnchainSeriesPoint } from '@/lib/onchain/format';

interface TrendValuationProps {
  latest: OnchainDashboardRow[];
  /** v_onchain_series rows (oldest→newest per key) for the price sparkline. Only
   *  btc_price_usd carries a stored series; the derived metrics have none. */
  series?: OnchainSeriesPoint[];
}

// Fixed display order: the BTC/USD price the panel is about, then the
// moving-average ladder, then the derived ratios and oscillators.
const ORDER = [
  'btc_price_usd', 'ma_50d', 'ma_200d', 'ma_200w', 'mayer_multiple', 'ma_cross',
  'rsi_14', 'realized_vol_30d', 'drawdown_from_high',
];

/**
 * Trend & Valuation panel — the BTC/USD price and its price-derived metrics
 * (moving averages, the Mayer Multiple, the 50d/200d cross, RSI, realised
 * volatility, drawdown). A peer of the On-chain panel, kept separate because these
 * come from the BTC/USD price series, not from what the network reports about
 * itself. Only the price row has a stored series (rendered as a sparkline); the
 * derived metrics carry none. Context, never a call.
 */
export function TrendValuation({ latest, series = [] }: TrendValuationProps) {
  const rows = latest
    .filter((r) => r.metric_group === 'trend_valuation')
    .sort((a, b) => {
      const ra = ORDER.indexOf(a.key ?? '');
      const rb = ORDER.indexOf(b.key ?? '');
      return (ra === -1 ? ORDER.length : ra) - (rb === -1 ? ORDER.length : rb);
    });

  if (rows.length === 0) return null;

  // v_onchain_series is ordered (indicator_id, observed_at ASC); group by key so
  // the price card finds its own history. Derived metrics fall back to [].
  const seriesByKey = new Map<string, number[]>();
  for (const point of series) {
    if (!point.key || point.value == null) continue;
    const arr = seriesByKey.get(point.key) ?? [];
    arr.push(point.value);
    seriesByKey.set(point.key, arr);
  }

  return (
    <section className={styles.panel} aria-labelledby="trend-valuation-heading">
      <div className={styles.head}>
        <h2 id="trend-valuation-heading" className={styles.title}>
          Trend &amp; valuation
        </h2>
        <p className={styles.sub}>
          Where price sits against its own moving averages, in US dollars. Historical context, not
          calls: figures stand as evidence, never as buy or sell signals.
        </p>
      </div>

      <div className={styles.group}>
        <div className={styles.grid}>
          {rows.map((row) => (
            <OnchainCard key={row.key ?? ''} row={row} series={seriesByKey.get(row.key ?? '') ?? []} />
          ))}
        </div>
      </div>
    </section>
  );
}
