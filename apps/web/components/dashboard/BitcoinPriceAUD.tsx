import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { getBtcPrice } from '@/lib/dashboard/btcPrice';
import { formatDay } from '@/lib/onchain/format';
import styles from './BitcoinPriceAUD.module.css';

const priceFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

export async function BitcoinPriceAUD() {
  const result = await getBtcPrice('aud');

  if (!result) {
    return (
      <Card>
        <h2 className={styles.title}>Bitcoin Price (AUD)</h2>
        <p className={styles.unavailable}>Price unavailable</p>
      </Card>
    );
  }

  if (result.source === 'cache') {
    return (
      <Card>
        <div className={styles.header}>
          <h2 className={styles.title}>Bitcoin Price (AUD)</h2>
          <StatusChip label="Cached" color="neutral" />
        </div>
        <div className={styles.value}>{priceFormatter.format(result.price)}</div>
        <div className={styles.scale}>As at {formatDay(result.observedAt)}</div>
      </Card>
    );
  }

  const { price, change24h } = result;
  const changeLabel =
    change24h === null
      ? null
      : `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
  const changeColor = change24h === null ? 'neutral' : change24h >= 0 ? 'success' : 'destructive';

  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>Bitcoin Price (AUD)</h2>
        {changeLabel && <StatusChip label={changeLabel} color={changeColor} />}
      </div>
      <div className={styles.value}>{priceFormatter.format(price)}</div>
      <div className={styles.scale}>24h change</div>
    </Card>
  );
}
