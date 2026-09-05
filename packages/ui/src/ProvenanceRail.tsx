'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import styles from './ProvenanceRail.module.css';
import { cn } from './cn';

/**
 * The provenance rail: every numeric fact can name the document it came from.
 *
 * Not a tooltip and not a footnote. Three research records produced three
 * unrelated ways a stated figure overstates a corporate position, and in one of
 * them three credible secondary sources were wrong about a first purchase by
 * about fifty per cent. The defence is that a reader can always see which
 * document a number came from and what class of document it is — so the
 * citation travels with the number rather than living in a bibliography.
 *
 * `ProvenanceProvider` holds one toggle for the page; `Cited` wraps a fact.
 * With the rail off, the citation is still in the DOM for assistive technology
 * and still reachable — it is visually condensed, never removed.
 */

export type ProvenanceSourceClass =
  | 'regulated_disclosure'
  | 'exchange_announcement'
  | 'audited_accounts'
  | 'investor_presentation'
  | 'company_web'
  | 'secondary';

export interface ProvenanceSource {
  documentTitle: string;
  sourceClass: ProvenanceSourceClass;
  sourceUrl: string | null;
  publishedAt: string | null;
  isAudited?: boolean;
}

/** Short labels, ordered strongest first. The rank is the point, not the name. */
export const SOURCE_CLASS_LABELS: Record<ProvenanceSourceClass, string> = {
  regulated_disclosure: 'Regulated disclosure',
  exchange_announcement: 'Exchange announcement',
  audited_accounts: 'Audited accounts',
  investor_presentation: 'Investor presentation',
  company_web: 'Company website',
  secondary: 'Secondary',
};

/** Rank 1 is strongest. Mirrors `source_classes.rank`. */
export const SOURCE_CLASS_RANK: Record<ProvenanceSourceClass, number> = {
  regulated_disclosure: 1,
  exchange_announcement: 2,
  audited_accounts: 3,
  investor_presentation: 4,
  company_web: 5,
  secondary: 6,
};

const ProvenanceContext = createContext(false);

export function ProvenanceProvider({
  shown,
  children,
}: {
  shown: boolean;
  children: ReactNode;
}) {
  return <ProvenanceContext.Provider value={shown}>{children}</ProvenanceContext.Provider>;
}

export function useProvenanceShown(): boolean {
  return useContext(ProvenanceContext);
}

export function ProvenanceToggle({
  shown,
  onChange,
  className,
}: {
  shown: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  const labelId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-labelledby={labelId}
      className={cn(styles.toggle, className)}
      onClick={() => onChange(!shown)}
    >
      <span id={labelId}>Show sources</span>
      <span className={cn(styles.switch, shown && styles.switchOn)} aria-hidden="true" />
    </button>
  );
}

/**
 * A fact and its citation.
 *
 * `fact` is whatever the reader is looking at — a quantity, a consideration, a
 * date. `source` is where it came from, and there is no way to render one
 * without the other, which is the point: a component that made the source
 * optional would let a page ship a number with no provenance and still
 * typecheck.
 */
export function Cited({
  fact,
  source,
  detail,
  className,
}: {
  fact: ReactNode;
  source: ProvenanceSource;
  /** Extra context — a page reference, "inclusive of fees". */
  detail?: string;
  className?: string;
}) {
  const shown = useProvenanceShown();
  const rank = SOURCE_CLASS_RANK[source.sourceClass];

  return (
    <span className={cn(styles.cited, className)}>
      <span className={styles.fact}>{fact}</span>
      <span className={cn(styles.rail, shown ? styles.railOpen : styles.railClosed)}>
        <SourceBadge sourceClass={source.sourceClass} />
        {source.sourceUrl ? (
          <a className={styles.doc} href={source.sourceUrl} rel="noreferrer">
            {source.documentTitle}
          </a>
        ) : (
          <span className={styles.doc}>{source.documentTitle}</span>
        )}
        {source.publishedAt ? (
          <time className={styles.when} dateTime={source.publishedAt}>
            {source.publishedAt}
          </time>
        ) : (
          // A document with no date is a gap, not a blank. Saying so is cheaper
          // than a reader assuming the date was simply not rendered.
          <span className={styles.when}>Date not disclosed</span>
        )}
        {detail ? <span className={styles.detail}>{detail}</span> : null}
        {rank > 2 ? (
          <span className={styles.weak}>Below the class the ledger accepts</span>
        ) : null}
      </span>
    </span>
  );
}

export function SourceBadge({
  sourceClass,
  className,
}: {
  sourceClass: ProvenanceSourceClass;
  className?: string;
}) {
  const rank = SOURCE_CLASS_RANK[sourceClass];

  return (
    <span
      className={cn(styles.badge, rank <= 2 ? styles.badgeStrong : styles.badgeWeak, className)}
      title={`Source class ${rank} of 6`}
    >
      {SOURCE_CLASS_LABELS[sourceClass]}
    </span>
  );
}
