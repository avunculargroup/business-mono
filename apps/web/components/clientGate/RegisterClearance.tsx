'use client';

import type { ReviewState } from '@platform/shared';
import { setRegisterClearance } from '@/app/actions/clientPromotion';
import { ClientGate } from './ClientGate';
import { RecordReview } from './RecordReview';
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
}: {
  companyId: string;
  reviewState: ReviewState;
  cleared: boolean;
  clientSummary: string | null;
}) {
  return (
    <div className={styles.stack}>
      <RecordReview companyId={companyId} reviewState={reviewState} cleared={cleared} />
      {reviewState === 'internal' ? (
        <ClientGate
          cleared={cleared}
          consequence="Subscribers see this entry in the register — its summary, its implementation facts, its ledger and its stated absences. Never outcome facts: the register answers how an entity did this, not how it went for them."
          withheldConsequence="Internal only. Reviewing a record puts it on the internal register; clearing it for subscribers is a separate decision."
          requireNote={{
            label: 'Subscriber summary',
            hint: 'What a subscriber reads at the top of the entry. How the entity holds bitcoin and how it discloses it — never how the holding has performed.',
            initial: clientSummary ?? '',
          }}
          onChange={(next, summary) => setRegisterClearance(companyId, next, summary)}
        />
      ) : null}
    </div>
  );
}
