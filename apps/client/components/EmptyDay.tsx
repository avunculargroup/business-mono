import styles from './EmptyDay.module.css';

/**
 * The quiet-day state.
 *
 * Mandatory on every surface that can be empty, and built before the populated
 * one. The reasoning in the platform principles is that a state built second
 * looks like an afterthought; the reasoning specific to this app is stronger
 * than that. On most days nothing material happens, so this is not the edge
 * case — it is the common case, and a subscriber who opens Minute on a quiet
 * Tuesday should feel the product working rather than broken.
 *
 * It says what did not happen and when. What it never does is manufacture
 * something to fill the space.
 */
export function EmptyDay({
  headline,
  detail,
  asAt,
}: {
  headline: string;
  detail: string;
  asAt?: string;
}) {
  return (
    <section className={styles.quiet}>
      {/* A grey rule, not a gold one. Gold is freshness. */}
      <div className={styles.rule} aria-hidden="true" />
      <h2 className={styles.headline}>{headline}</h2>
      <p className={styles.detail}>{detail}</p>
      {asAt ? (
        <p className={styles.asAt}>
          As at <span className="mono">{asAt}</span>
        </p>
      ) : null}
    </section>
  );
}
