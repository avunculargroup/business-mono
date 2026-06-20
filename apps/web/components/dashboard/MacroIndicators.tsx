import styles from './MacroIndicators.module.css';
import { IndicatorCard } from './IndicatorCard';
import type { IndicatorLatest, IndicatorSeriesPoint } from '@/lib/indicators/format';

interface MacroIndicatorsProps {
  latest: IndicatorLatest[];
  series: IndicatorSeriesPoint[];
}

export function MacroIndicators({ latest, series }: MacroIndicatorsProps) {
  if (latest.length === 0) return null;

  // v_indicator_series is already ordered (indicator_id, period_date ASC).
  const seriesByIndicator = new Map<string, number[]>();
  for (const point of series) {
    if (!point.indicator_id || point.value == null) continue;
    const arr = seriesByIndicator.get(point.indicator_id) ?? [];
    arr.push(point.value);
    seriesByIndicator.set(point.indicator_id, arr);
  }

  const local = latest.filter((r) => r.region === 'au');
  const global = latest.filter((r) => r.region !== 'au');

  return (
    <section className={styles.panel} aria-labelledby="macro-indicators-heading">
      <div className={styles.head}>
        <h2 id="macro-indicators-heading" className={styles.title}>
          Macro indicators
        </h2>
        <p className={styles.sub}>
          The slower signals beneath the tickers — money, prices, and the policy rates that set the
          cost of holding cash.
        </p>
      </div>

      <Group label="Local" rows={local} seriesByIndicator={seriesByIndicator} />
      <Group label="Global" rows={global} seriesByIndicator={seriesByIndicator} />
    </section>
  );
}

function Group({
  label,
  rows,
  seriesByIndicator,
}: {
  label: string;
  rows: IndicatorLatest[];
  seriesByIndicator: Map<string, number[]>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.group}>
      <div className={styles.groupLabel}>{label}</div>
      <div className={styles.grid}>
        {rows.map((row) => (
          <IndicatorCard
            key={row.indicator_id}
            row={row}
            series={seriesByIndicator.get(row.indicator_id ?? '') ?? []}
          />
        ))}
      </div>
    </div>
  );
}
