import styles from './OnchainIndicators.module.css';
import { OnchainCard } from './OnchainCard';
import type { OnchainDashboardRow } from '@/lib/onchain/format';

interface TrendValuationProps {
  latest: OnchainDashboardRow[];
}

// Fixed display order: the moving-average ladder, then the derived ratios and
// oscillators. Keys are the v_btc_trend_metrics slugs.
const ORDER = [
  'ma_50d', 'ma_200d', 'ma_200w', 'mayer_multiple', 'ma_cross',
  'rsi_14', 'realized_vol_30d', 'drawdown_from_high',
];

/**
 * Trend & Valuation panel — price-derived Bitcoin metrics (moving averages, the
 * Mayer Multiple, the 50d/200d cross, RSI, realised volatility, drawdown). A peer
 * of the On-chain panel, kept separate because these come from the BTC/USD price
 * series, not from what the network reports about itself. Every metric is derived
 * (no stored series), so cards render without sparklines. Context, never a call.
 */
export function TrendValuation({ latest }: TrendValuationProps) {
  const rows = latest
    .filter((r) => r.metric_group === 'trend_valuation')
    .sort((a, b) => {
      const ra = ORDER.indexOf(a.key ?? '');
      const rb = ORDER.indexOf(b.key ?? '');
      return (ra === -1 ? ORDER.length : ra) - (rb === -1 ? ORDER.length : rb);
    });

  if (rows.length === 0) return null;

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
            <OnchainCard key={row.key ?? ''} row={row} series={[]} />
          ))}
        </div>
      </div>
    </section>
  );
}
