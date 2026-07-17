'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { DraftFeedback, type DraftFeedbackEntry } from './DraftFeedback';
import { updateContentStatus } from '@/app/actions/content';
import { useToast } from '@/providers/ToastProvider';
import { formatDate } from '@/lib/utils';
import styles from './ContentEditor.module.css';

type ContentItem = {
  id: string;
  title: string | null;
  type: string;
  status: string;
  body: string | null;
  is_thread: boolean;
  social_account_id?: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ThreadSegment = {
  id: string;
  body: string;
};

const statusFlow: Record<string, { next: string; label: string }> = {
  idea: { next: 'draft', label: 'Start draft' },
  draft: { next: 'review', label: 'Submit for review' },
  review: { next: 'approved', label: 'Approve' },
  approved: { next: 'scheduled', label: 'Schedule' },
  scheduled: { next: 'published', label: 'Mark published' },
};

interface ContentEditorProps {
  item: ContentItem;
  threadSegments: ThreadSegment[];
  priorFeedback?: DraftFeedbackEntry[];
}

export function ContentEditor({ item, threadSegments, priorFeedback = [] }: ContentEditorProps) {
  const [body, setBody] = useState(item.body || '');
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(item.status);
  const { success, error } = useToast();

  const fullText = item.is_thread ? threadSegments.map((s) => s.body).join(' ') : body;
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const charCount = fullText.length;
  const copyText = item.is_thread
    ? threadSegments.map((s, i) => `${i + 1}/ ${s.body}`).join('\n\n')
    : body;

  const nextStep = statusFlow[optimisticStatus];

  const handleAdvance = () => {
    if (!nextStep) return;
    startTransition(async () => {
      setOptimisticStatus(nextStep.next);
      const result = await updateContentStatus(item.id, nextStep.next);
      if (result.error) {
        error(result.error);
      } else {
        success(`Moved to ${nextStep.next}`);
      }
    });
  };

  return (
    <div className={styles.layout}>
      <div className={styles.editor}>
        {item.is_thread ? (
          <ol className={styles.segments}>
            {threadSegments.map((segment, i) => (
              <li key={segment.id} className={styles.segment}>
                <span className={styles.segmentNo}>{i + 1}/</span>
                <p className={styles.segmentBody}>{segment.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start writing..."
          />
        )}
        <div className={styles.counts}>
          <span>
            {wordCount} words / {charCount} characters{item.is_thread ? ` / ${threadSegments.length} posts` : ''}
          </span>
          <CopyButton text={copyText} label="Copy text" />
        </div>
      </div>

      <aside className={styles.meta}>
        <div className={styles.field}>
          <span className={styles.label}>Type</span>
          <StatusChip label={item.type.replace('_', ' ')} color="accent" />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Status</span>
          <StatusChip label={optimisticStatus} color="neutral" />
        </div>

        {item.scheduled_for && (
          <div className={styles.field}>
            <span className={styles.label}>Scheduled</span>
            <span>{formatDate(item.scheduled_for)}</span>
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Created</span>
          <span className={styles.dateValue}>{formatDate(item.created_at)}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Updated</span>
          <span className={styles.dateValue}>{formatDate(item.updated_at)}</span>
        </div>

        {nextStep && (
          <Button variant="primary" size="md" onClick={handleAdvance} loading={isPending}>
            {nextStep.label}
          </Button>
        )}

        {item.social_account_id && (
          <DraftFeedback contentItemId={item.id} priorFeedback={priorFeedback} />
        )}
      </aside>
    </div>
  );
}
