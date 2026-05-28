import { Card } from '@/components/ui/Card';
import styles from './BlockHeight.module.css';

async function fetchHeight(): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://mempool.space/api/blocks/tip/height', {
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const height = Number(text);
    if (!Number.isFinite(height) || height <= 0) return null;
    return height;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const heightFormatter = new Intl.NumberFormat('en-US');

export async function BlockHeight() {
  const height = await fetchHeight();

  if (height === null) {
    return (
      <Card>
        <h2 className={styles.title}>Block Height</h2>
        <p className={styles.unavailable}>Height unavailable</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className={styles.title}>Block Height</h2>
      <div className={styles.value}>{heightFormatter.format(height)}</div>
      <div className={styles.scale}>Bitcoin mainnet tip</div>
    </Card>
  );
}
