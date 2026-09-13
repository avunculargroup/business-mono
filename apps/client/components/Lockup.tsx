import styles from './Lockup.module.css';

/**
 * The Minute lockup.
 *
 * Product name over endorsement line. The second line is the **endorsement
 * line**, not a byline — a byline is an author credit, and using that word here
 * causes confusion. It names the licensed entity a reader can look up, which is
 * the one job it exists to do, so it is always the trading name: "Minute, by
 * BTS" fails at that job.
 *
 * Specs from `.claude/skills/bts-design/references/naming.md`.
 *
 * The `standalone` variant is deliberately not offered here. Cold and alone,
 * "Minute" is briefly ambiguous in pronunciation — some readers land on
 * my-NOOT before correcting — and the endorsement line is what resolves it.
 * Anywhere the name might meet someone for the first time, it needs the line.
 */
export function Lockup({
  variant = 'stacked',
}: {
  variant?: 'stacked' | 'horizontal' | 'gold-rule';
}) {
  return (
    <span className={`${styles.lockup} ${styles[variant]}`}>
      {variant === 'gold-rule' && <span className={styles.rule} aria-hidden="true" />}
      <span className={styles.product}>Minute</span>
      <span className={styles.endorsement}>
        {variant === 'horizontal' ? 'Bitcoin Treasury Solutions' : 'by Bitcoin Treasury Solutions'}
      </span>
    </span>
  );
}
