import styles from './ResearchPanels.module.css';
import { Cited, SourceBadge, type ProvenanceSource } from './ProvenanceRail';
import { BasisChip, type HoldingBasis } from './BasisChip';
import { cn } from './cn';

/**
 * The panels that carry the register's compliance and provenance rules.
 *
 * Grouped in one module because they share a card treatment and are only ever
 * used together on a company page; splitting them into five files would be five
 * imports and one stylesheet copied five times.
 */

// ── Position ─────────────────────────────────────────────────────────────────

export interface PositionRowView {
  id: string;
  asOfDate: string;
  asset: string;
  instrumentType: string;
  quantity: number;
  basis: HoldingBasis;
  basisComparable: boolean;
  lookThroughBtcEquivalent: number | null;
  isRelatedPartyVehicle: boolean;
  includesCustomerAssets: boolean;
  provenance: ProvenanceSource;
}

/**
 * What a row's quantity is counted in.
 *
 * The unit comes from the instrument, never from the asset. A holding of
 * 889,367 fund units in a bitcoin fund is not 889,367 bitcoin — it is the
 * look-through equivalent the issuer states separately, three orders of
 * magnitude smaller. Labelling the row in the asset's symbol would print the
 * exact overstatement this feature exists to prevent, on the page that exists
 * to prevent it.
 */
function unitFor(row: PositionRowView): string {
  switch (row.instrumentType) {
    case 'fund_units':
      return 'units';
    case 'spc_investment':
      return 'interests';
    case 'tokenised_fund':
      return 'tokens';
    default:
      return row.asset.toUpperCase();
  }
}

/**
 * The current position.
 *
 * The aggregate arrives already decided by the adapter; this renders it and the
 * rows that were kept out of it. The excluded rows are shown at the same visual
 * weight as the included ones — a reader who cannot see that the issuer stated
 * a larger figure is worse off than one who can.
 */
export function PositionPanel({
  asset,
  comparableTotal,
  rows,
  excluded,
  className,
}: {
  asset: string;
  comparableTotal: number;
  rows: PositionRowView[];
  excluded: PositionRowView[];
  className?: string;
}) {
  const excludedIds = new Set(excluded.map((row) => row.id));

  if (rows.length === 0) {
    return (
      <p className={cn(styles.card, styles.quiet, className)}>
        No holdings snapshot has been sourced for this company at the class the register
        accepts.
      </p>
    );
  }

  return (
    <div className={cn(styles.card, className)}>
      <p className={styles.total}>
        <span className={styles.totalFigure}>
          {comparableTotal.toLocaleString('en-AU', { maximumFractionDigits: 8 })}{' '}
          {asset.toUpperCase()}
        </span>
        <span className={styles.totalLabel}>
          on a comparable basis
          {excluded.length > 0
            ? ` · ${excluded.length} row${excluded.length === 1 ? '' : 's'} excluded`
            : ''}
        </span>
      </p>

      <ul className={styles.rows}>
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(styles.positionRow, excludedIds.has(row.id) && styles.rowExcluded)}
          >
            <div className={styles.positionFigure}>
              <Cited
                fact={
                  <span className={styles.qty}>
                    {row.quantity.toLocaleString('en-AU', { maximumFractionDigits: 8 })}{' '}
                    {unitFor(row)}
                  </span>
                }
                source={row.provenance}
                detail={
                  // The equivalent is the only figure on this row that is in
                  // the asset, and it is the issuer's own statement rather than
                  // anything computed here.
                  row.lookThroughBtcEquivalent !== null
                    ? `Issuer states this as equivalent to ${row.lookThroughBtcEquivalent} ${asset.toUpperCase()}`
                    : undefined
                }
              />
            </div>

            <div className={styles.positionMeta}>
              <BasisChip basis={row.basis} comparable={row.basisComparable} />
              <span className={styles.instrument}>{row.instrumentType.replace(/_/g, ' ')}</span>
              {row.isRelatedPartyVehicle ? (
                <span className={styles.flag}>Units in a vehicle the issuer manages</span>
              ) : null}
              {row.includesCustomerAssets ? (
                <span className={styles.flag}>Includes assets custodied for customers</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Source conflict ──────────────────────────────────────────────────────────

export interface FactView {
  id: string;
  fieldKey: string;
  label: string;
  value: string;
  asOf: string | null;
  provenance: ProvenanceSource;
  conflicting: {
    value: string;
    provenance: Pick<ProvenanceSource, 'documentTitle' | 'sourceClass' | 'sourceUrl'>;
  } | null;
}

/**
 * A qualitative fact, with the claim that lost where two documents disagreed.
 *
 * The rule this renders was written after getting it wrong: a company's About
 * page claimed self-custody with no counterparty risk, its offer document named
 * a third-party custodian and listed custodian insolvency as a key risk, and
 * the first version of that research recorded the marketing answer. Marketing
 * copy cannot populate a controls field, and the conflict is shown rather than
 * resolved out of sight — a register that silently picked the winner would be
 * teaching the opposite of the lesson.
 */
export function FactPanel({ fact, className }: { fact: FactView; className?: string }) {
  return (
    <div className={cn(styles.card, className)}>
      <div className={styles.factHead}>
        <h3 className={styles.factLabel}>{fact.label}</h3>
        <SourceBadge sourceClass={fact.provenance.sourceClass} />
      </div>

      {fact.value.split('\n\n').map((paragraph, index) => (
        <p key={index} className={styles.factValue}>
          {paragraph}
        </p>
      ))}

      <p className={styles.factSource}>
        {fact.provenance.sourceUrl ? (
          <a href={fact.provenance.sourceUrl} rel="noreferrer">
            {fact.provenance.documentTitle}
          </a>
        ) : (
          fact.provenance.documentTitle
        )}
        {fact.asOf ? <span className={styles.asOf}> · as at {fact.asOf}</span> : null}
      </p>

      {fact.conflicting ? (
        <div className={styles.conflict}>
          <p className={styles.conflictHead}>
            A weaker source says otherwise
            <SourceBadge sourceClass={fact.conflicting.provenance.sourceClass} />
          </p>
          <p className={styles.conflictValue}>{fact.conflicting.value}</p>
          <p className={styles.conflictWhy}>
            The stronger document wins on source class, and the claim it beat is kept rather
            than deleted. Marketing copy cannot populate a controls field, and this rule was
            written after an earlier revision of this research recorded the wrong answer by
            trusting a website.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── Structural absence ───────────────────────────────────────────────────────

export interface AbsenceView {
  subject: string;
  statement: string;
  provenance: ProvenanceSource;
}

/**
 * A fact the register can state because it is missing.
 *
 * An empty covenant panel and a company with no debt look identical on a
 * screen, and only one of them is an answer.
 */
export function AbsencePanel({
  absences,
  className,
}: {
  absences: AbsenceView[];
  className?: string;
}) {
  if (absences.length === 0) return null;

  return (
    <div className={cn(styles.card, className)}>
      <ul className={styles.absences}>
        {absences.map((absence) => (
          <li key={absence.subject} className={styles.absence}>
            <Cited fact={<span>{absence.statement}</span>} source={absence.provenance} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Withheld ─────────────────────────────────────────────────────────────────

export interface WithheldView {
  fieldKey: string;
  classification: 'internal' | 'restricted';
  reason: string;
}

const WITHHELD_LABELS: Record<string, string> = {
  unrealised_position: 'Unrealised position against cost basis',
  nav_premium: 'Premium or discount to net asset value, and holdings per share',
  share_price_attribution: 'Share price movement attributed to an announcement',
  dilution_narration: 'Dilution from issuance, accretion from a buyback',
  buyback_inference: "Management's view of the share price, inferred from a buyback",
  shareholder_outcome_comparison: 'Shareholder outcome against holding the asset directly',
  covenant_credit_signal: 'Covenant waivers read as a credit-quality signal',
  curator_notes: 'Curator notes',
};

/**
 * What the page declines to say, and why.
 *
 * Rendered rather than silently omitted, which is the whole difference between
 * compliance as architecture and compliance as a disclaimer. A page that
 * quietly dropped the unrealised position would look identical to one that had
 * never computed it.
 */
export function WithheldPanel({
  fields,
  className,
}: {
  fields: WithheldView[];
  className?: string;
}) {
  if (fields.length === 0) return null;

  return (
    <div className={cn(styles.card, styles.withheld, className)}>
      <p className={styles.withheldLede}>
        This page states what a company did and disclosed, with a citation on every claim. It
        never states what that means for the security. The following are withheld by design.
      </p>
      <dl className={styles.withheldList}>
        {fields.map((field) => (
          <div key={field.fieldKey} className={styles.withheldItem}>
            <dt>
              {WITHHELD_LABELS[field.fieldKey] ?? field.fieldKey.replace(/_/g, ' ')}
              <span
                className={cn(
                  styles.withheldTag,
                  field.classification === 'restricted' && styles.withheldRestricted,
                )}
              >
                {field.classification}
              </span>
            </dt>
            <dd>{field.reason}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Freshness ────────────────────────────────────────────────────────────────

/**
 * Staleness against the issuer's own cadence.
 *
 * The same ninety days of silence is unremarkable for an episodic discloser and
 * overdue for one that committed to reporting monthly, so the stamp says which
 * standard it is applying rather than just how long it has been.
 */
export function FreshnessStamp({
  cadence,
  latestDocumentAt,
  daysSinceDocument,
  staleAfterDays,
  isStale,
  className,
}: {
  cadence: string;
  latestDocumentAt: string | null;
  daysSinceDocument: number | null;
  staleAfterDays: number;
  isStale: boolean;
  className?: string;
}) {
  if (latestDocumentAt === null) {
    return (
      <p className={cn(styles.freshness, className)}>
        <span className={styles.dot} aria-hidden="true" />
        No document has been retrieved for this company yet. That is a record nobody has
        fetched for, which is a different state from one that has gone quiet.
      </p>
    );
  }

  return (
    <p className={cn(styles.freshness, isStale && styles.freshnessStale, className)}>
      <span className={styles.dot} aria-hidden="true" />
      <span>
        Last filing <time dateTime={latestDocumentAt}>{latestDocumentAt}</time>
        {daysSinceDocument !== null ? ` · ${daysSinceDocument} days ago` : ''}
      </span>
      <span className={styles.freshnessRule}>
        {isStale
          ? `Overdue against a ${cadence} cadence, which this register treats as stale after ${staleAfterDays} days.`
          : `Within a ${cadence} cadence, which this register treats as stale after ${staleAfterDays} days.`}
      </span>
    </p>
  );
}
