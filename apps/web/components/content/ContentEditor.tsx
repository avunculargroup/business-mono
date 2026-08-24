'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { StatusChip } from '@platform/ui/StatusChip';
import { Button } from '@platform/ui/Button';
import { CopyButton } from '@platform/ui/CopyButton';
import { DraftFeedback } from './DraftFeedback';
import {
  updateContentStatus,
  updateContentBody,
  scheduleContent,
  postContentNow,
} from '@/app/actions/content';
import { useToast } from '@platform/ui/ToastProvider';
import { formatDate } from '@/lib/utils';
import type { ContentDetail, DraftFeedbackEntry, ThreadSegment } from '@platform/data';
import type { ContentStatus } from '@platform/shared';
import styles from './ContentEditor.module.css';

const statusFlow: Record<string, { next: ContentStatus; label: string }> = {
  idea: { next: 'draft', label: 'Start draft' },
  draft: { next: 'review', label: 'Submit for review' },
  review: { next: 'approved', label: 'Approve' },
  approved: { next: 'scheduled', label: 'Schedule' },
  scheduled: { next: 'published', label: 'Mark published' },
};

// LinkedIn's feed collapses posts behind "…see more" after roughly this many
// characters — what shows before the click is the hook.
const LINKEDIN_FOLD_CHARS = 210;

const MARKDOWN_PATTERN = /(\*\*|__|^#{1,6}\s|\[.+\]\(.+\))/m;

const EDITABLE_STATUSES = new Set(['idea', 'draft', 'review', 'approved', 'scheduled']);

/** Format an ISO timestamp as a local datetime-local input value. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ContentEditorProps {
  item: ContentDetail;
  threadSegments: ThreadSegment[];
  priorFeedback?: DraftFeedbackEntry[];
  maxChars?: number | null;
}

export function ContentEditor({ item, threadSegments, priorFeedback = [], maxChars = null }: ContentEditorProps) {
  const [body, setBody] = useState(item.body || '');
  const [savedBody, setSavedBody] = useState(item.body || '');
  const [scheduleAt, setScheduleAt] = useState(toDatetimeLocal(item.scheduledFor));
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(item.status);
  const { success, error } = useToast();

  const fullText = item.isThread ? threadSegments.map((s) => s.body).join(' ') : body;
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const charCount = fullText.length;
  const copyText = item.isThread
    ? threadSegments.map((s, i) => `${i + 1}/ ${s.body}`).join('\n\n')
    : body;

  const isLinkedIn = item.type === 'linkedin';
  const isDirty = !item.isThread && body !== savedBody;
  const isEditable = !item.isThread && EDITABLE_STATUSES.has(optimisticStatus);
  const overLimit = maxChars !== null && !item.isThread && body.length > maxChars;
  const hasMarkdown = isLinkedIn && !item.isThread && MARKDOWN_PATTERN.test(body);

  // LinkedIn posts move approved → scheduled → published through the schedule
  // panel + publish poller, not the generic advance button.
  const nextStep =
    isLinkedIn && (optimisticStatus === 'approved' || optimisticStatus === 'scheduled')
      ? undefined
      : statusFlow[optimisticStatus];

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

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateContentBody(item.id, { body });
      if (result.error) {
        error(result.error);
      } else {
        setSavedBody(body);
        success('Draft saved');
      }
    });
  };

  const handleSchedule = () => {
    if (!scheduleAt) {
      error('Pick a date and time first.');
      return;
    }
    startTransition(async () => {
      const result = await scheduleContent(item.id, new Date(scheduleAt).toISOString());
      if (result.error) {
        error(result.error);
      } else {
        setOptimisticStatus('scheduled');
        success('Post scheduled');
      }
    });
  };

  const handlePostNow = () => {
    if (!window.confirm('Post to LinkedIn now? It will publish within a minute.')) return;
    startTransition(async () => {
      const result = await postContentNow(item.id);
      if (result.error) {
        error(result.error);
      } else {
        setOptimisticStatus('scheduled');
        success('Publishing — the post will go live within a minute');
      }
    });
  };

  return (
    <div className={styles.layout}>
      <div className={styles.editor}>
        {item.isThread ? (
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
            readOnly={!isEditable}
          />
        )}
        <div className={styles.counts}>
          <span className={overLimit ? styles.overLimit : undefined}>
            {wordCount} words / {charCount}
            {maxChars !== null && !item.isThread ? ` of ${maxChars}` : ''} characters
            {item.isThread ? ` / ${threadSegments.length} posts` : ''}
          </span>
          <span className={styles.countActions}>
            {isDirty && (
              <Button variant="primary" size="sm" onClick={handleSave} loading={isPending}>
                Save
              </Button>
            )}
            <CopyButton text={copyText} label="Copy text" />
          </span>
        </div>
        {isLinkedIn && !item.isThread && (hasMarkdown || overLimit || body.length > LINKEDIN_FOLD_CHARS) && (
          <div className={styles.formatNotes}>
            {overLimit && (
              <p className={styles.formatWarning}>
                Over LinkedIn&rsquo;s {maxChars}-character limit — it cannot be published until shortened.
              </p>
            )}
            {hasMarkdown && (
              <p className={styles.formatWarning}>
                Markdown does not render on LinkedIn — asterisks, headings, and link syntax post as
                literal characters. Line breaks are kept.
              </p>
            )}
            {body.length > LINKEDIN_FOLD_CHARS && (
              <p className={styles.formatNote}>
                The feed shows the first ~{LINKEDIN_FOLD_CHARS} characters before &ldquo;…see
                more&rdquo;: <span className={styles.foldPreview}>{body.slice(0, LINKEDIN_FOLD_CHARS)}</span>
              </p>
            )}
          </div>
        )}
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

        {item.scheduledFor && (
          <div className={styles.field}>
            <span className={styles.label}>Scheduled</span>
            <span>{formatDate(item.scheduledFor)}</span>
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Created</span>
          <span className={styles.dateValue}>{formatDate(item.createdAt)}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Updated</span>
          <span className={styles.dateValue}>{formatDate(item.updatedAt)}</span>
        </div>

        {item.publishError && optimisticStatus !== 'published' && (
          <div className={styles.field}>
            <span className={styles.label}>Publish error</span>
            <span className={styles.publishError}>{item.publishError}</span>
          </div>
        )}

        {nextStep && (
          <Button variant="primary" size="md" onClick={handleAdvance} loading={isPending}>
            {nextStep.label}
          </Button>
        )}

        {isLinkedIn && (optimisticStatus === 'approved' || optimisticStatus === 'scheduled') && (
          <div className={styles.schedulePanel}>
            <span className={styles.label}>
              {optimisticStatus === 'scheduled' ? 'Reschedule' : 'Schedule to LinkedIn'}
            </span>
            <input
              type="datetime-local"
              className={styles.datetimeInput}
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
            <div className={styles.scheduleActions}>
              <Button variant="primary" size="sm" onClick={handleSchedule} loading={isPending}>
                {optimisticStatus === 'scheduled' ? 'Reschedule' : 'Schedule'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handlePostNow} loading={isPending}>
                Post now
              </Button>
            </div>
          </div>
        )}

        {item.socialAccountId && (
          <DraftFeedback contentItemId={item.id} priorFeedback={priorFeedback} />
        )}
      </aside>
    </div>
  );
}
