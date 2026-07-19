'use client';

import { createSegment, updateSegment } from '@/app/actions/segments';
import type { SegmentScorecard } from '@platform/shared';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

interface SegmentFormProps {
  onSuccess: (segment?: SegmentScorecard) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: SegmentScorecard;
}

export function SegmentForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: SegmentFormProps) {
  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Segment',
    create: createSegment,
    update: (formData) => updateSegment(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.segment as SegmentScorecard | undefined),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'segment-edit-form' : 'segment-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormField
        label="Segment name"
        name="segment_name"
        required
        defaultValue={defaultValues?.segment_name ?? ''}
        placeholder="e.g. Law Firms, Tech Start-ups"
      />

      <FormRow>
        <FormField
          label="Need score (1–5)"
          name="need_score"
          type="number"
          min={1}
          max={5}
          defaultValue={defaultValues?.need_score ?? ''}
          placeholder="How acute is the pain?"
        />
        <FormField
          label="Access score (1–5)"
          name="access_score"
          type="number"
          min={1}
          max={5}
          defaultValue={defaultValues?.access_score ?? ''}
          placeholder="How easy to reach?"
        />
      </FormRow>

      <FormField
        label="Planned interviews"
        name="planned_interviews"
        type="number"
        min={0}
        defaultValue={defaultValues?.planned_interviews ?? 0}
      />

      <FormTextarea
        label="Notes"
        name="notes"
        rows={3}
        defaultValue={defaultValues?.notes ?? ''}
        placeholder="Qualitative reasoning for these scores…"
      />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
