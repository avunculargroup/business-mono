'use client';

import { useActionState, useEffect } from 'react';
import { createSegment, updateSegment } from '@/app/actions/segments';
import { useToast } from '@/providers/ToastProvider';
import type { SegmentScorecard } from '@platform/shared';
import styles from './InterviewForm.module.css';

interface SegmentFormProps {
  onSuccess: (segment?: SegmentScorecard) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: SegmentScorecard;
}

export function SegmentForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: SegmentFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updateSegment(defaultValues.id, formData);
      if (result.error) {
        error(result.error);
        return { error: result.error };
      }
      success('Segment updated');
      onSuccess();
      return null;
    }

    const result = await createSegment(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Segment created');
    onSuccess(result.segment as SegmentScorecard);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'segment-edit-form' : 'segment-form';

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Segment name *</label>
        <input
          name="segment_name"
          required
          defaultValue={defaultValues?.segment_name ?? ''}
          className={styles.input}
          placeholder="e.g. Law Firms, Tech Start-ups"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Need score (1–5)</label>
          <input
            type="number"
            name="need_score"
            min={1}
            max={5}
            defaultValue={defaultValues?.need_score ?? ''}
            className={styles.input}
            placeholder="How acute is the pain?"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Access score (1–5)</label>
          <input
            type="number"
            name="access_score"
            min={1}
            max={5}
            defaultValue={defaultValues?.access_score ?? ''}
            className={styles.input}
            placeholder="How easy to reach?"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Planned interviews</label>
        <input
          type="number"
          name="planned_interviews"
          min={0}
          defaultValue={defaultValues?.planned_interviews ?? 0}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ''}
          className={styles.textarea}
          placeholder="Qualitative reasoning for these scores…"
        />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
