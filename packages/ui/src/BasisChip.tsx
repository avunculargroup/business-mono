import styles from './BasisChip.module.css';
import { cn } from './cn';

/**
 * The basis on a holdings row, and whether it may enter an aggregate.
 *
 * Rule 1 made visible. Three research records produced four bases, each found
 * the hard way: a stated figure can include exposure through a fund the issuer
 * manages, or assets custodied for third parties, or have no determinable basis
 * at all. A row without a comparable basis renders — flagged — and is excluded
 * from every total, because hiding it would leave a reader unable to see that
 * the issuer had stated a larger number.
 */

export type HoldingBasis =
  | 'direct_spot'
  | 'look_through'
  | 'includes_customer_assets'
  | 'stated_unreconciled';

const LABELS: Record<HoldingBasis, string> = {
  direct_spot: 'Direct spot',
  look_through: 'Look-through',
  includes_customer_assets: 'Includes customer assets',
  stated_unreconciled: 'Stated, unreconciled',
};

const WHY: Record<HoldingBasis, string> = {
  direct_spot: 'Held directly by the entity, with no vehicle in between. Enters the total.',
  look_through:
    'Includes exposure through fund units or another vehicle. Not economically identical to a '
    + 'direct holding, so it never enters a total.',
  includes_customer_assets:
    'The figure aggregates assets custodied for third parties with the corporate position. '
    + 'Excluded from the total.',
  stated_unreconciled:
    'The issuer stated a figure with no determinable basis. Rendered as stated, and excluded '
    + 'from every comparison.',
};

export function BasisChip({
  basis,
  comparable,
  className,
}: {
  basis: HoldingBasis;
  /**
   * Read from the lookup rather than inferred from the basis name. A fifth
   * basis is expected, and a component that decided comparability itself would
   * be the second place that rule lives.
   */
  comparable: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(styles.chip, comparable ? styles.comparable : styles.excluded, className)}
      title={WHY[basis]}
    >
      {LABELS[basis]}
      {comparable ? null : <span className={styles.mark}> · excluded</span>}
    </span>
  );
}

/** The one-line explanation, for a panel that has room to say it in full. */
export function basisExplanation(basis: HoldingBasis): string {
  return WHY[basis];
}
