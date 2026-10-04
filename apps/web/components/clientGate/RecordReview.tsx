'use client';

import { useState, useTransition } from 'react';
import { Archive, CircleCheck, CircleDashed } from 'lucide-react';
import type { ReviewState } from '@platform/shared';
import { approveDraftRows, setReviewState } from '@/app/actions/clientPromotion';
import styles from './RecordReview.module.css';

/**
 * `research_companies.review_state`, as a control.
 *
 * The step before subscriber clearance. A record an agent created lands as
 * `draft` and stays off the register until someone has read it; clearance is
 * not offered until then. Each state names what moving it would do, because
 * leaving `internal` also withholds the entry from subscribers.
 */

const STATES: Record<
  ReviewState,
  { label: string; description: string; icon: typeof CircleCheck }
> = {
  draft: {
    label: 'Draft',
    description:
      'Not yet reviewed. It is not on the internal register and cannot be cleared for subscribers.',
    icon: CircleDashed,
  },
  internal: {
    label: 'Reviewed',
    description: 'On the internal register. It can be cleared for subscribers below.',
    icon: CircleCheck,
  },
  retired: {
    label: 'Retired',
    description: 'Off the register. Kept for its history.',
    icon: Archive,
  },
};

const ACTIONS: Record<ReviewState, Array<{ to: ReviewState; label: string; primary?: boolean }>> = {
  draft: [
    { to: 'internal', label: 'Mark reviewed', primary: true },
    { to: 'retired', label: 'Retire' },
  ],
  internal: [
    { to: 'draft', label: 'Return to draft' },
    { to: 'retired', label: 'Retire' },
  ],
  retired: [{ to: 'internal', label: 'Restore to register' }],
};

export function RecordReview({
  companyId,
  reviewState,
  cleared,
  draftRows = 0,
}: {
  companyId: string;
  reviewState: ReviewState;
  cleared: boolean;
  /** Ledger, fact and absence rows on this record that nobody has reviewed. */
  draftRows?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { label, description, icon: Icon } = STATES[reviewState];

  function run(action: () => Promise<{ error?: string; success?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section className={styles.review} aria-label="Review">
      <span className={`${styles.state} ${styles[reviewState]}`}>
        <Icon size={16} strokeWidth={1.5} aria-hidden />
        {label}
      </span>
      <p className={styles.description}>
        {description}
        {reviewState === 'internal' && cleared
          ? ' Returning it to draft or retiring it also withholds it from subscribers.'
          : null}
      </p>

      {draftRows > 0 ? (
        <div className={styles.rows}>
          <p className={styles.description}>
            {draftRows === 1 ? 'One row' : `${draftRows} rows`} on this record{' '}
            {draftRows === 1 ? 'is a draft' : 'are drafts'}, marked below. A draft row reaches
            no subscriber, whatever the record&rsquo;s state.
          </p>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => run(() => approveDraftRows(companyId))}
            disabled={pending}
          >
            Approve {draftRows === 1 ? 'the draft row' : `${draftRows} draft rows`}
          </button>
        </div>
      ) : null}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {ACTIONS[reviewState].map((action) => (
          <button
            key={action.to}
            type="button"
            className={action.primary ? styles.primaryButton : styles.ghostButton}
            onClick={() => run(() => setReviewState(companyId, action.to))}
            disabled={pending}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
