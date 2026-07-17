'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { submitDraftFeedback } from '@/app/actions/contentFeedback';
import { useToast } from '@/providers/ToastProvider';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import styles from './DraftFeedback.module.css';

export type DraftFeedbackEntry = {
  id: string;
  verdict: string | null;
  feedback: string;
  created_at: string;
};

type Verdict = 'positive' | 'negative';

interface DraftFeedbackProps {
  contentItemId: string;
  priorFeedback: DraftFeedbackEntry[];
}

/**
 * Feedback box for a generated social draft. Notes are distilled into the
 * account's standing guidelines on the agents server, so they shape every
 * future draft — not just this one.
 */
export function DraftFeedback({ contentItemId, priorFeedback }: DraftFeedbackProps) {
  const [note, setNote] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(priorFeedback);
  const { success, error } = useToast();

  const handleSubmit = () => {
    const feedback = note.trim();
    if (!feedback) return;
    startTransition(async () => {
      const result = await submitDraftFeedback({
        contentItemId,
        feedback,
        verdict: verdict ?? undefined,
      });
      if (result.error) {
        error(result.error);
      } else {
        success('Feedback saved — future drafts will use it');
        setEntries((prev) => [
          { id: `local-${Date.now()}`, verdict, feedback, created_at: new Date().toISOString() },
          ...prev,
        ]);
        setNote('');
        setVerdict(null);
      }
    });
  };

  const toggleVerdict = (v: Verdict) => setVerdict((prev) => (prev === v ? null : v));

  return (
    <div className={styles.container}>
      <span className={styles.label}>Feedback</span>
      <p className={styles.hint}>Shapes every future draft for this account.</p>
      <div className={styles.verdicts}>
        <button
          type="button"
          className={cn(styles.verdict, verdict === 'positive' && styles.verdictActive)}
          aria-pressed={verdict === 'positive'}
          onClick={() => toggleVerdict('positive')}
        >
          Good
        </button>
        <button
          type="button"
          className={cn(styles.verdict, verdict === 'negative' && styles.verdictActive)}
          aria-pressed={verdict === 'negative'}
          onClick={() => toggleVerdict('negative')}
        >
          Needs work
        </button>
      </div>
      <textarea
        className={styles.textarea}
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What should change, or what worked"
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={handleSubmit}
        loading={isPending}
        disabled={!note.trim()}
      >
        Save feedback
      </Button>

      {entries.length > 0 && (
        <ul className={styles.history}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.entryMeta}>
                {entry.verdict === 'positive' ? 'Good · ' : entry.verdict === 'negative' ? 'Needs work · ' : ''}
                {formatDate(entry.created_at)}
              </span>
              <p className={styles.entryBody}>{entry.feedback}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
