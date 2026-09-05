import styles from './ResearchLedger.module.css';
import { Cited, type ProvenanceSource } from './ProvenanceRail';
import { BasisChip, type HoldingBasis } from './BasisChip';
import { cn } from './cn';

/**
 * The disclosed ledger.
 *
 * Not a table. At 360px a table either scrolls sideways or crushes its columns,
 * and this content — a date, a headline, a quantity, a citation — reads better
 * stacked anyway. It becomes column-aligned from 720px through grid template
 * columns, so nothing is duplicated for the two layouts and there is one DOM.
 *
 * Every numeric cell goes through `Cited`. A figure without a source is the bug
 * this feature exists to prevent, and the type makes it unrepresentable.
 */

export interface LedgerRow {
  id: string;
  eventDate: string;
  eventType: string;
  headline: string;
  detail: string | null;
  quantity: number | null;
  assetClass: string;
  considerationNative: number | null;
  nativeCurrency: string | null;
  considerationAud: number | null;
  fxRateUsed: number | null;
  feesIncluded: boolean | null;
  basis: HoldingBasis | null;
  basisComparable: boolean | null;
  classification: 'publishable' | 'internal' | 'restricted';
  provenance: ProvenanceSource;
}

const EVENT_LABELS: Record<string, string> = {
  policy_adoption: 'Policy adopted',
  acquisition: 'Acquisition',
  disposal: 'Disposal',
  capital_raise: 'Capital raise',
  covenant_change: 'Covenant change',
  capital_posture_change: 'Capital posture change',
  custody_change: 'Custody change',
  listing_change: 'Listing change',
  accounting_election: 'Accounting election',
};

/** Full precision, always. A rounded quantity is the failure mode, not the format. */
function formatQuantity(value: number, asset: string): string {
  return `${value.toLocaleString('en-AU', { maximumFractionDigits: 8 })} ${asset.toUpperCase()}`;
}

function formatMoney(value: number, currency: string | null): string {
  return `${currency ? `${currency} ` : ''}${value.toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function ResearchLedger({ rows, className }: { rows: LedgerRow[]; className?: string }) {
  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        No treasury event has been disclosed for this company. That is a record of silence,
        not a gap in the register.
      </p>
    );
  }

  return (
    <ol className={cn(styles.ledger, className)}>
      <li className={styles.head} aria-hidden="true">
        <span>Date</span>
        <span>Event</span>
        <span className={styles.numeric}>Disclosed</span>
      </li>

      {rows.map((row) => (
        <li key={row.id} className={styles.row}>
          <time className={styles.date} dateTime={row.eventDate}>
            {row.eventDate}
          </time>

          <div className={styles.what}>
            <p className={styles.eventType}>{EVENT_LABELS[row.eventType] ?? row.eventType}</p>
            <h3 className={styles.headline}>{row.headline}</h3>
            {row.detail ? <p className={styles.detail}>{row.detail}</p> : null}
            {row.classification !== 'publishable' ? (
              <p className={styles.internal}>
                Internal — this row states a disclosed fact whose natural reading is a view on
                the security, so it does not reach a client-facing surface.
              </p>
            ) : null}
          </div>

          <div className={styles.numeric}>
            <Cited
              fact={
                <span className={styles.figures}>
                  {row.quantity !== null ? (
                    <span className={styles.qty}>
                      {formatQuantity(row.quantity, row.assetClass)}
                    </span>
                  ) : null}
                  {row.considerationNative !== null ? (
                    <span className={styles.money}>
                      {formatMoney(row.considerationNative, row.nativeCurrency)}
                      {row.feesIncluded ? <span className={styles.fees}> incl. fees</span> : null}
                    </span>
                  ) : null}
                  {row.quantity === null && row.considerationNative === null ? (
                    <span className={styles.noFigure}>No figure disclosed</span>
                  ) : null}
                </span>
              }
              source={row.provenance}
              detail={
                // Only ever shown for a converted figure, and it names the rate
                // that made it. A converted number that cannot say how is a
                // number nobody can check.
                row.considerationAud !== null && row.fxRateUsed !== null
                  ? `AUD ${formatMoney(row.considerationAud, null)} at ${row.fxRateUsed}`
                  : undefined
              }
            />
            {row.basis ? (
              <BasisChip
                basis={row.basis}
                comparable={row.basisComparable ?? false}
                className={styles.basis}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
