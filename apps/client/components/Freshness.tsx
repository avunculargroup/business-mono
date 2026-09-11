import styles from './Freshness.module.css';

/**
 * How old a fact is, in words, next to a gold dot.
 *
 * Gold appears here and nowhere else on any page. That is the rule, and the
 * reason is that gold has one job: the moment it also means "good", it means
 * neither — and a colour that means "good" next to a number is an implied view.
 *
 * Past its expected cadence it turns to the warning tone rather than a louder
 * gold, because a stale figure is a different kind of thing from a fresh one
 * and should not read as more of the same.
 */
export function Freshness({
  asAt,
  expectedCadenceDays,
  now = new Date(),
}: {
  asAt: string;
  expectedCadenceDays?: number;
  now?: Date;
}) {
  const observed = new Date(asAt);

  if (Number.isNaN(observed.getTime())) {
    // Absence is a fact. An undated figure says so rather than rendering a
    // blank space where a date should be.
    return (
      <span className={styles.freshness}>
        <span className={styles.dot} aria-hidden="true" />
        No date stated
      </span>
    );
  }

  const days = Math.floor((now.getTime() - observed.getTime()) / 86_400_000);
  const stale = expectedCadenceDays !== undefined && days > expectedCadenceDays;

  return (
    <span
      className={`${styles.freshness} ${stale ? styles.stale : styles.fresh}`}
      title={`As at ${asAt}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      {describeAge(days)}
      {stale && expectedCadenceDays !== undefined
        ? `, expected every ${expectedCadenceDays} days`
        : ''}
    </span>
  );
}

/**
 * Age in words, because "401 days ago" is a signal and "2025-08-06" is a date.
 *
 * The spec makes the point about the signals feed and it holds everywhere: a
 * reader converting a date to an age in their head is a reader who does not
 * notice the number is old.
 */
function describeAge(days: number): string {
  if (days < 0) return 'Dated ahead';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
