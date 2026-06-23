import styles from './OnchainCard.module.css';
import {
  computeDelta,
  displayValue,
  formatDay,
  isFresh,
  rangePosition,
  signalState,
  sparklinePath,
  unitLabel,
  POOL_CONCENTRATION_NOTE_THRESHOLD,
  type OnchainDashboardRow,
} from '@/lib/onchain/format';

interface OnchainCardProps {
  row: OnchainDashboardRow;
  /** Current observations, oldest→newest, for the sparkline / range marker. */
  series: number[];
}

export function OnchainCard({ row, series }: OnchainCardProps) {
  const fresh = isFresh(row.days_since_observed);
  const isSignal = row.unit === 'signal';
  const isMvrv = row.key === 'mvrv';

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.label}>{row.short_label}</div>
        {fresh && (
          <span className={styles.fresh}>
            <span className={styles.dot} aria-hidden="true" />
            fresh
          </span>
        )}
      </div>

      {row.value == null ? (
        <p className={styles.empty}>Awaiting first reading</p>
      ) : isSignal ? (
        <SignalChip row={row} />
      ) : (
        <>
          <div className={styles.valueRow}>
            <span className={styles.value}>{displayValue(row)}</span>
            {unitLabel(row.unit) && <span className={styles.unit}>{unitLabel(row.unit)}</span>}
          </div>

          <Delta row={row} />

          {isMvrv ? (
            <RangeMarker row={row} series={series} />
          ) : (
            series.length >= 2 && <Sparkline series={series} />
          )}

          {row.key === 'pool_concentration_top' &&
            row.value > POOL_CONCENTRATION_NOTE_THRESHOLD && (
              <div className={styles.note}>top pool above {POOL_CONCENTRATION_NOTE_THRESHOLD}% of recent blocks</div>
            )}
        </>
      )}

      {row.observed_at && (
        <div className={styles.asat}>as at {formatDay(row.observed_at)}</div>
      )}
    </div>
  );
}

function Delta({ row }: { row: OnchainDashboardRow }) {
  const delta = computeDelta(row);
  if (delta.kind === 'flat') return null; // derived metrics (NULL delta) simply omit it
  const arrow = delta.kind === 'up' ? '▲' : '▼'; // direction only, never colour
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

/** Hash-Ribbons state — a neutral chip. States what the cross IS, never "BUY". */
function SignalChip({ row }: { row: OnchainDashboardRow }) {
  const signal = signalState(row);
  if (!signal) return <p className={styles.empty}>No signal yet</p>;
  return (
    <div className={styles.signalRow}>
      <span className={styles.signalChip} data-signal={signal}>
        {signal}
      </span>
      {row.value != null && (
        <span className={styles.signalMeta}>
          30/60-day spread {row.value >= 0 ? '+' : '−'}
          {Math.abs(row.value).toFixed(row.decimals ?? 2)}%
        </span>
      )}
    </div>
  );
}

/**
 * MVRV historical-range marker — where the current value sits within its own
 * observed history. Deliberately colour-NEUTRAL: this is context (where price
 * stands relative to the network's aggregate cost basis), never a cheap/expensive
 * judgement, a buy/sell cue, or a price prediction. Falls back to a sparkline.
 */
function RangeMarker({ row, series }: { row: OnchainDashboardRow; series: number[] }) {
  const pos = rangePosition(row.value, series);
  if (!pos) return series.length >= 2 ? <Sparkline series={series} /> : null;
  return (
    <div className={styles.range} aria-label="position within observed history">
      <div className={styles.rangeTrack}>
        <span className={styles.rangeFill} style={{ width: `${(pos.fraction * 100).toFixed(1)}%` }} />
        <span className={styles.rangeMark} style={{ left: `${(pos.fraction * 100).toFixed(1)}%` }} aria-hidden="true" />
      </div>
      <div className={styles.rangeScale}>
        <span>{pos.min.toFixed(row.decimals ?? 2)}</span>
        <span className={styles.muted}>observed range</span>
        <span>{pos.max.toFixed(row.decimals ?? 2)}</span>
      </div>
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
