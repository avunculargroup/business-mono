import styles from './IndicatorCard.module.css';
import {
  categoryLabel,
  computeDelta,
  formatDay,
  formatPeriod,
  formatValue,
  isDailyGranularity,
  isFresh,
  pickYoy,
  sparklinePath,
  unitLabel,
  type IndicatorLatest,
} from '@/lib/indicators/format';

interface IndicatorCardProps {
  row: IndicatorLatest;
  /** Current-vintage values, oldest→newest, for the sparkline. */
  series: number[];
}

export function IndicatorCard({ row, series }: IndicatorCardProps) {
  const decimals = row.decimals ?? 2;
  const fresh = isFresh(row.daysSinceRelease);
  // Daily market tickers show a day-precise "as at" (and no month period or
  // ~daily "next release" line, which would just be noise).
  const daily = isDailyGranularity(row);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <div className={styles.label}>{row.shortLabel}</div>
          <div className={styles.cat}>{categoryLabel(row.category)}</div>
        </div>
        {fresh && (
          <span className={styles.fresh}>
            <span className={styles.dot} aria-hidden="true" />
            new
          </span>
        )}
      </div>

      {row.currentValue == null ? (
        <p className={styles.empty}>Awaiting first print</p>
      ) : (
        <>
          <div className={styles.valueRow}>
            <span className={styles.value}>{formatValue(row.currentValue, decimals)}</span>
            <span className={styles.unit}>{unitLabel(row.unit)}</span>
          </div>

          <Delta row={row} />
          <Yoy row={row} />

          {series.length >= 2 && <Sparkline series={series} />}

          {row.isRevision && row.supersededValue != null && (
            <div className={styles.chip}>revised from {formatValue(row.supersededValue, decimals)}</div>
          )}

          {row.periodDate && (
            <div className={styles.asat}>
              {daily ? (
                formatDay(row.periodDate)
              ) : (
                <>
                  {formatPeriod(row.periodDate)}
                  {row.releasedAt && <> · released {formatDay(row.releasedAt)}</>}
                </>
              )}
            </div>
          )}
          {!daily && row.expectedNextRelease && (
            <div className={styles.next}>next release ~ {formatDay(row.expectedNextRelease)}</div>
          )}
        </>
      )}
    </div>
  );
}

function Delta({ row }: { row: IndicatorLatest }) {
  const delta = computeDelta(row);
  if (delta.kind === 'flat') {
    return <div className={`${styles.delta} ${styles.muted}`}>unchanged on prior</div>;
  }
  const arrow = delta.kind === 'up' ? '▲' : '▼'; // ▲ ▼ — direction only, no colour
  return (
    <div className={styles.delta}>
      <span className={styles.arrow} aria-hidden="true">
        {arrow}
      </span>
      {delta.magnitude}
      {delta.pct && <span className={styles.muted}> ({delta.pct})</span>}
      <span className={styles.muted}> on prior</span>
    </div>
  );
}

function Yoy({ row }: { row: IndicatorLatest }) {
  const yoy = pickYoy(row);
  if (!yoy) return null;
  return (
    <div className={styles.secondary}>
      <span className={styles.k}>{yoy.label}</span>
      {yoy.text}
    </div>
  );
}

function Sparkline({ series }: { series: number[] }) {
  const spark = sparklinePath(series);
  if (!spark) return null;
  return (
    <div className={styles.spark}>
      <svg viewBox={`0 0 ${spark.w} ${spark.h}`} preserveAspectRatio="none" aria-hidden="true">
        <path
          d={spark.d}
          fill="none"
          stroke="var(--color-accent-base)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={spark.last[0].toFixed(1)} cy={spark.last[1].toFixed(1)} r="2.5" fill="var(--color-accent-dark)" />
      </svg>
    </div>
  );
}
