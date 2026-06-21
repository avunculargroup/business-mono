import styles from './OnchainIndicators.module.css';
import { OnchainCard } from './OnchainCard';
import { groupLabel, type OnchainDashboardRow, type OnchainSeriesPoint } from '@/lib/onchain/format';

interface OnchainIndicatorsProps {
  latest: OnchainDashboardRow[];
  series: OnchainSeriesPoint[];
}

// Display order within the panel: network security first, then holder behaviour.
const GROUP_ORDER = ['network_security', 'behaviour_valuation'] as const;

export function OnchainIndicators({ latest, series }: OnchainIndicatorsProps) {
  if (latest.length === 0) return null;

  // v_onchain_series is ordered (indicator_id, observed_at ASC); group by key so
  // each card finds its own history (derived metrics have no series).
  const seriesByKey = new Map<string, number[]>();
  for (const point of series) {
    if (!point.key || point.value == null) continue;
    const arr = seriesByKey.get(point.key) ?? [];
    arr.push(point.value);
    seriesByKey.set(point.key, arr);
  }

  return (
    <section className={styles.panel} aria-labelledby="onchain-indicators-heading">
      <div className={styles.head}>
        <h2 id="onchain-indicators-heading" className={styles.title}>
          On-chain indicators
        </h2>
        <p className={styles.sub}>
          What the network reports about itself — mining security and holder behaviour. Context, not
          calls: figures stand as evidence, never as buy or sell signals.
        </p>
      </div>

      {GROUP_ORDER.map((group) => (
        <Group
          key={group}
          label={groupLabel(group)}
          rows={latest.filter((r) => r.metric_group === group)}
          seriesByKey={seriesByKey}
        />
      ))}
    </section>
  );
}

function Group({
  label,
  rows,
  seriesByKey,
}: {
  label: string;
  rows: OnchainDashboardRow[];
  seriesByKey: Map<string, number[]>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.group}>
      <div className={styles.groupLabel}>{label}</div>
      <div className={styles.grid}>
        {rows.map((row) => (
          <OnchainCard key={row.key ?? ''} row={row} series={seriesByKey.get(row.key ?? '') ?? []} />
        ))}
      </div>
    </div>
  );
}
