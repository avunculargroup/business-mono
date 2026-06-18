import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './OpenRouterCredits.module.css';

interface CreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
}

export interface Credits {
  remaining: number;
  total: number;
  used: number;
  /** remaining / total, or null when total is 0 (no basis for a percentage) */
  fractionRemaining: number | null;
}

type ChipColor = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

/** Pure parse of the OpenRouter `/credits` payload. Returns null on malformed data. */
export function deriveCredits(json: CreditsResponse): Credits | null {
  const total = json.data?.total_credits;
  const used = json.data?.total_usage;
  if (typeof total !== 'number' || Number.isNaN(total)) return null;
  if (typeof used !== 'number' || Number.isNaN(used)) return null;
  const remaining = total - used;
  const fractionRemaining = total > 0 ? remaining / total : null;
  return { remaining, total, used, fractionRemaining };
}

/** Percentage chip with severity colour. Null when there's no total to measure against. */
export function balanceChip(
  fractionRemaining: number | null,
): { label: string; color: ChipColor } | null {
  if (fractionRemaining === null) return null;
  const pct = Math.max(0, Math.round(fractionRemaining * 100));
  const color: ChipColor =
    fractionRemaining < 0.1 ? 'destructive' : fractionRemaining < 0.25 ? 'warning' : 'success';
  return { label: `${pct}% remaining`, color };
}

async function fetchCredits(): Promise<Credits | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as CreditsResponse;
    return deriveCredits(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export async function OpenRouterCredits() {
  const credits = await fetchCredits();

  if (!credits) {
    return (
      <Card>
        <h2 className={styles.title}>OpenRouter Credits</h2>
        <p className={styles.unavailable}>Credits unavailable</p>
      </Card>
    );
  }

  const chip = balanceChip(credits.fractionRemaining);

  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>OpenRouter Credits</h2>
        {chip && <StatusChip label={chip.label} color={chip.color} />}
      </div>
      <div className={styles.value}>{usd.format(credits.remaining)}</div>
      <div className={styles.scale}>
        {usd.format(credits.used)} used of {usd.format(credits.total)}
      </div>
    </Card>
  );
}
