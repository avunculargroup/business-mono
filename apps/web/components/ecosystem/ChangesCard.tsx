'use client';

import Link from 'next/link';
import { StatusChip } from '@platform/ui/StatusChip';
import { ECOSYSTEM_CHANGE_TYPE_LABELS } from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import styles from './WatchesCard.module.css';

export type EntityChange = {
  id: string;
  change_type: string;
  title: string;
  summary: string | null;
  severity: string | null;
  curator_note: string | null;
  occurred_at: string | null;
  detected_at: string;
  external_url: string | null;
};

interface ChangesCardProps {
  changes: EntityChange[];
  /** Whether this entity has any watches, so the empty state can say which. */
  hasWatches: boolean;
}

// Same rule as the feed: severity may use warning/destructive, nothing on a
// change is ever success-green, and change_type carries no valence.
function severityColor(severity: string | null): 'neutral' | 'warning' | 'destructive' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'high') return 'warning';
  return 'neutral';
}

/** Read-only, mirroring the interaction-history section on the same pages. */
export function ChangesCard({ changes, hasWatches }: ChangesCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>What&apos;s changed</span>
        {changes.length > 0 && (
          <Link href="/signals" className={styles.itemMeta}>
            All signals
          </Link>
        )}
      </div>

      {changes.length > 0 ? (
        changes.map((change) => (
          <div key={change.id} className={styles.itemRow}>
            <div className={styles.itemBody}>
              <span className={styles.itemName}>{change.title}</span>
              {change.summary && <span className={styles.itemMeta}>{change.summary}</span>}
              {change.curator_note && <span className={styles.itemMeta}>{change.curator_note}</span>}
              <span className={`${styles.itemMeta} ${styles.mono}`}>
                {formatRelativeDate(change.occurred_at ?? change.detected_at)}
              </span>
            </div>
            <StatusChip
              label={
                ECOSYSTEM_CHANGE_TYPE_LABELS[
                  change.change_type as keyof typeof ECOSYSTEM_CHANGE_TYPE_LABELS
                ] ?? change.change_type
              }
              color="neutral"
            />
            {change.severity && (
              <StatusChip label={change.severity} color={severityColor(change.severity)} />
            )}
          </div>
        ))
      ) : (
        <div className={styles.emptyCard}>
          {hasWatches
            ? 'Nothing has changed since these watches started.'
            : 'Add a watch to see what changes here.'}
        </div>
      )}
    </div>
  );
}
