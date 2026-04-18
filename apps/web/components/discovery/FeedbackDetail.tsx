'use client';

import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import {
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackSource,
  type FeedbackCategory,
} from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { FeedbackRow } from './FeedbackList';
import styles from './FeedbackDetail.module.css';

interface FeedbackDetailProps {
  entry: FeedbackRow;
  onDelete: () => void;
}

const SENTIMENT_COLORS: Record<string, 'success' | 'neutral' | 'destructive' | 'warning'> = {
  positive: 'success',
  neutral:  'neutral',
  negative: 'destructive',
  mixed:    'warning',
};

export function FeedbackDetail({ entry, onDelete }: FeedbackDetailProps) {
  return (
    <div className={styles.container}>
      <div className={styles.chips}>
        <StatusChip label={FEEDBACK_CATEGORY_LABELS[entry.category as FeedbackCategory] ?? entry.category} color="neutral" />
        <StatusChip label={FEEDBACK_SOURCE_LABELS[entry.source as FeedbackSource] ?? entry.source} color="neutral" />
        {entry.sentiment && (
          <StatusChip label={entry.sentiment.label} color={SENTIMENT_COLORS[entry.sentiment.label] ?? 'neutral'} />
        )}
        {entry.rating != null && (
          <StatusChip label={`${entry.rating}/5`} color="neutral" />
        )}
      </div>

      <div className={styles.description}>
        <p>{entry.description}</p>
      </div>

      {(entry.contacts || entry.companies) && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Associated with</span>
          <div className={styles.associations}>
            {entry.contacts && (
              <span className={styles.association}>
                {entry.contacts.first_name} {entry.contacts.last_name}
              </span>
            )}
            {entry.companies && (
              <span className={styles.association}>{entry.companies.name}</span>
            )}
          </div>
        </div>
      )}

      {entry.pain_points && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Pain point</span>
          <p className={styles.painPoint}>{entry.pain_points.content}</p>
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Tags</span>
          <div className={styles.tags}>
            {entry.tags.map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        </div>
      )}

      {entry.date_received && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Date received</span>
          <span className={styles.value}>{entry.date_received}</span>
        </div>
      )}

      <div className={styles.meta}>
        Added {formatRelativeDate(entry.created_at)}
      </div>

      <div className={styles.footer}>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 size={14} strokeWidth={1.5} /> Delete
        </Button>
      </div>
    </div>
  );
}
