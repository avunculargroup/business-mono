import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './BitcoinPriceAUD.module.css';

interface SimplePriceResponse {
  bitcoin?: {
    usd?: number;
    usd_24h_change?: number;
  };
}

async function fetchPrice(): Promise<{ price: number; change24h: number | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      {
        signal: controller.signal,
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as SimplePriceResponse;
    const price = json.bitcoin?.usd;
    if (typeof price !== 'number' || Number.isNaN(price)) return null;
    const change = json.bitcoin?.usd_24h_change;
    const change24h = typeof change === 'number' && !Number.isNaN(change) ? change : null;
    return { price, change24h };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export async function BitcoinPriceUSD() {
  const result = await fetchPrice();

  if (!result) {
    return (
      <Card>
        <h2 className={styles.title}>Bitcoin Price (USD)</h2>
        <p className={styles.unavailable}>Price unavailable</p>
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
        <h2 className={styles.title}>Bitcoin Price (USD)</h2>
        {changeLabel && <StatusChip label={changeLabel} color={changeColor} />}
      </div>
      <div className={styles.value}>{priceFormatter.format(price)}</div>
      <div className={styles.scale}>24h change</div>
    </Card>
  );
}
