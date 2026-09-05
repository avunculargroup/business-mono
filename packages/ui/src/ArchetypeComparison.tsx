import styles from './ArchetypeComparison.module.css';
import { cn } from './cn';

/**
 * A comparison across register records — or the panel explaining why there
 * isn't one.
 *
 * Archetype gates the comparison, it does not merely label it. A funds manager
 * has no treasury policy to lift, no board approval path worth studying and no
 * covenant story; rendering it in the same table as an operating business
 * would actively mislead, and the register exists to avoid exactly that kind of
 * false equivalence.
 *
 * The refusal is structural rather than editorial: the repository throws
 * `ArchetypeMismatchError` and this component renders what it means. A page
 * that received a boolean would be a page that could ignore it.
 */

export type Archetype =
  | 'treasury_allocation'
  | 'treasury_company'
  | 'native_exposure'
  | 'operational_integration';

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  treasury_allocation: 'Treasury allocation',
  treasury_company: 'Treasury company',
  native_exposure: 'Native exposure',
  operational_integration: 'Operational integration',
};

const ARCHETYPE_DEFINITIONS: Record<Archetype, string> = {
  treasury_allocation: 'An operating business allocating surplus capital.',
  treasury_company: 'The balance sheet is the thesis, funded from capital markets.',
  native_exposure: 'A fund manager or exchange, where the asset sits beside the product line.',
  operational_integration:
    "The position accrues from a business line's own gross profit.",
};

export interface ComparableCompany {
  slug: string;
  legalName: string;
  primaryArchetype: Archetype;
  selfDescribedArchetype: Archetype | null;
  jurisdiction: string;
  reportingStandard: string | null;
}

export function ArchetypeComparison({
  companies,
  mismatch,
  className,
}: {
  companies: ComparableCompany[];
  /** The archetypes that could not be reconciled, when the repository refused. */
  mismatch?: readonly Archetype[];
  className?: string;
}) {
  if (mismatch && mismatch.length > 1) {
    return (
      <div className={cn(styles.refusal, className)} role="note">
        <h3 className={styles.refusalHead}>These records are not comparable</h3>
        <p className={styles.refusalBody}>
          You asked to compare {mismatch.map((a) => ARCHETYPE_LABELS[a]).join(' against ')}.
          The register will not render that table.
        </p>
        <dl className={styles.definitions}>
          {mismatch.map((archetype) => (
            <div key={archetype}>
              <dt>{ARCHETYPE_LABELS[archetype]}</dt>
              <dd>{ARCHETYPE_DEFINITIONS[archetype]}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.refusalWhy}>
          A funds manager has no treasury policy to lift, no board approval path worth
          studying and no covenant story. Putting one beside an operating business would
          suggest a comparison a reader could act on, and there is none — which is why this
          is a refusal in the data layer rather than a caption under a table.
        </p>
      </div>
    );
  }

  if (companies.length === 0) return null;

  return (
    <div className={cn(styles.wrap, className)}>
      <p className={styles.archetypeNote}>
        All {companies.length} records below share the archetype{' '}
        <strong>{ARCHETYPE_LABELS[companies[0].primaryArchetype]}</strong>.{' '}
        {ARCHETYPE_DEFINITIONS[companies[0].primaryArchetype]}
      </p>

      {/* The only element on the page allowed its own scroll container: a
          comparison is inherently columnar, and the alternative at 360px is
          truncating company names. The page body never scrolls sideways. */}
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Jurisdiction</th>
              <th scope="col">Reporting standard</th>
              <th scope="col">Self-described</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.slug}>
                <th scope="row">{company.legalName}</th>
                <td>{company.jurisdiction}</td>
                <td>{company.reportingStandard ?? 'Not stated'}</td>
                <td>
                  {company.selfDescribedArchetype === null ? (
                    <span className={styles.same}>—</span>
                  ) : company.selfDescribedArchetype === company.primaryArchetype ? (
                    <span className={styles.same}>Same</span>
                  ) : (
                    // The divergence is the case study, not a labelling problem.
                    <span className={styles.diverges}>
                      {ARCHETYPE_LABELS[company.selfDescribedArchetype]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
