import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './FearGreedIndicator.module.css';

interface FngEntry {
  value?: string;
  value_classification?: string;
}

interface FngResponse {
  data?: FngEntry[];
}

type ChipColor = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

async function fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as FngResponse;
    const entry = json.data?.[0];
    const value = Number(entry?.value);
    if (!entry || Number.isNaN(value)) return null;
    return { value, classification: entry.value_classification ?? 'Unknown' };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function chipColor(classification: string): ChipColor {
  switch (classification) {
    case 'Extreme Fear':
      return 'destructive';
    case 'Fear':
      return 'warning';
    case 'Greed':
      return 'accent';
    case 'Extreme Greed':
      return 'success';
    default:
      return 'neutral';
  }
}

export async function FearGreedIndicator() {
  const result = await fetchFearGreed();

  if (!result) {
    return (
      <Card>
        <h2 className={styles.title}>Fear &amp; Greed Index</h2>
        <p className={styles.unavailable}>Index unavailable</p>
      </Card>
    );
  }

  const { value, classification } = result;

  return (
    <Card>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Fear &amp; Greed Index</h2>
          <StatusChip label={classification} color={chipColor(classification)} />
        </div>
        <span className={styles.value}>{value}</span>
      </div>
      <div className={styles.gaugeTrack}>
        <span className={styles.marker} style={{ left: `${value}%` }} />
      </div>
      <div className={styles.scale}>
        <span>Extreme Fear</span>
        <span>Extreme Greed</span>
      </div>
    </Card>
  );
}
