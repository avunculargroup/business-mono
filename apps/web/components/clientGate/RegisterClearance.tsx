'use client';

import { PenLine } from 'lucide-react';
import type { ReviewState } from '@platform/shared';
import { setRegisterClearance } from '@/app/actions/clientPromotion';
import { ClientGate } from './ClientGate';
import { RecordReview, type DraftGroup } from './RecordReview';
import styles from './RegisterClearance.module.css';

/**
 * Review, then `research_companies.client_cleared`, as one control.
 *
 * In that order because the schema insists on it: only a reviewed record can
 * be cleared (`client_clearance_needs_review`), so the gate is not offered on
 * a draft rather than offered and refused. Clearing asks for the summary a
 * subscriber reads, written for them and never copied from the curator notes,
 * which are internal and often say how things went rather than how they were
 * done.
 */
export function RegisterClearance({
  companyId,
  reviewState,
  cleared,
  clientSummary,
  draftGroups = [],
  changedSinceReview = false,
  changedRows = 0,
  summaryDraft = null,
}: {
  companyId: string;
  reviewState: ReviewState;
  cleared: boolean;
  clientSummary: string | null;
  draftGroups?: DraftGroup[];
  changedSinceReview?: boolean;
  changedRows?: number;
  /** What the ingest drafted, shown while no summary has been written. */
  summaryDraft?: { body: string; draftedAt: string } | null;
}) {
  // Once someone has written a summary the draft is history, and showing it
  // beside the real one would invite reading the wrong text.
  const draft = clientSummary?.trim() ? null : summaryDraft;

  return (
    <div className={styles.stack}>
      <RecordReview
        companyId={companyId}
        reviewState={reviewState}
        cleared={cleared}
        draftGroups={draftGroups}
        changedSinceReview={changedSinceReview}
        changedRows={changedRows}
      />
      {draft ? (
        <section className={styles.draft} aria-label="Drafted subscriber summary">
          <p className={styles.draftHead}>
            <PenLine size={16} strokeWidth={1.5} aria-hidden />
            <span>
              Drafted summary · Rex ·{' '}
              <time dateTime={draft.draftedAt}>{formatDate(draft.draftedAt)}</time>
            </span>
          </p>
          <p className={styles.draftBody}>{draft.body}</p>
          <p className={styles.draftHint}>
            Composed from this record&apos;s implementation facts. Edit it before clearing the
            entry: an unedited draft cannot be cleared.
          </p>
        </section>
      ) : null}
      {reviewState === 'internal' ? (
        <ClientGate
          cleared={cleared}
          consequence="Subscribers see this entry in the register — its summary, its implementation facts, its ledger and its stated absences. Never outcome facts: the register answers how an entity did this, not how it went for them."
          withheldConsequence="Internal only. Reviewing a record puts it on the internal register; clearing it for subscribers is a separate decision."
          requireNote={{
            label: 'Subscriber summary',
            hint: 'What a subscriber reads at the top of the entry. How the entity holds bitcoin and how it discloses it — never how the holding has performed.',
            initial: clientSummary?.trim() ? clientSummary : (draft?.body ?? ''),
          }}
          onChange={(next, summary) => setRegisterClearance(companyId, next, summary)}
        />
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
