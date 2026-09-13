import type { DirectoryEntry } from '@platform/data';
import styles from './DirectoryCard.module.css';

/**
 * One directory entry.
 *
 * The rule this component exists to enforce: **when `isFinancialProduct` is
 * true, the card emits no anchor and no contact action.** Not a disabled
 * button, not a link styled to look inert — no `<a>` element at all.
 *
 * A digital asset platform is a financial product under s764A(1) as amended in
 * April 2026. The difference between reporting on a provider and distributing
 * one is whether the reader can act from the page, so the absence of a call to
 * action is the structural difference, and it has to be structural rather than
 * visual. `DirectoryCard.test.tsx` is assertion 6 of the conformance list.
 *
 * Nothing here ranks. `australianOwned` is a fact and may be shown;
 * "recommended" is not a fact and may not.
 */
export function DirectoryCard({ entry }: { entry: DirectoryEntry }) {
  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <h3 className={styles.name}>{entry.name}</h3>
        {entry.australianOwned ? (
          <span className={styles.fact}>Australian owned</span>
        ) : null}
      </header>

      {entry.isFinancialProduct ? (
        <p className={styles.classification}>
          This service is a financial product under s764A(1). Minute reports on it and does not
          refer to it, so this entry carries no link and no contact details.
        </p>
      ) : null}

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>Regulatory status</dt>
          <dd>
            {entry.regulatoryStatus ? (
              <>
                {entry.regulatoryStatus.status}
                {' · as at '}
                <span className="mono">{entry.regulatoryStatus.asAt}</span>
                {' · '}
                {entry.regulatoryStatus.sourceName}
              </>
            ) : (
              /* Absence is a fact. Under the transition arrangements a
                 provider's status moves, and a stale status is worse than
                 none — so an untracked one says it is untracked. */
              <span className={styles.absent}>Not currently tracked</span>
            )}
          </dd>
        </div>

        <div className={styles.metaRow}>
          <dt>Our interest</dt>
          <dd>
            {entry.disclosure ? (
              /* Rendered verbatim. Authored, not templated — the point of the
                 column is that a person wrote the sentence being published. */
              entry.disclosure
            ) : (
              /* An affirmative statement, not a blank. A subscriber should
                 never have to leave the screen to find out whether BTS has an
                 interest in what they are reading. */
              <>Bitcoin Treasury Solutions has no commercial relationship with this entity.</>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}
