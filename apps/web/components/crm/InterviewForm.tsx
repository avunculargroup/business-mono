'use client';

import { createInterview, updateInterview } from '@/app/actions/interviews';
import type { InterviewRow } from './InterviewsList';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import { TagInput } from '@/components/ui/TagInput';
import styles from '@/components/ui/Form.module.css';

interface InterviewFormProps {
  contacts: { id: string; first_name: string; last_name: string }[];
  companies: { id: string; name: string }[];
  onSuccess: (interview?: InterviewRow) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: InterviewRow;
}

export function InterviewForm({
  contacts,
  companies,
  onSuccess,
  onPendingChange,
  mode = 'create',
  defaultValues,
}: InterviewFormProps) {
  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Interview',
    create: createInterview,
    update: (formData) => updateInterview(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.interview as InterviewRow | undefined),
    onPendingChange,
    successMessage: (m) => (m === 'edit' ? 'Interview updated' : 'Interview scheduled'),
  });

  const formId = mode === 'edit' ? 'interview-edit-form' : 'interview-form';

  // Format interview_date for datetime-local input (requires "YYYY-MM-DDTHH:MM")
  const defaultDateValue = defaultValues?.interview_date
    ? new Date(defaultValues.interview_date).toISOString().slice(0, 16)
    : '';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormSelect label="Contact" name="contact_id" defaultValue={defaultValues?.contact_id ?? ''}>
        <option value="">— Select contact —</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
        ))}
      </FormSelect>

      <FormSelect label="Company" name="company_id" defaultValue={defaultValues?.company_id ?? ''}>
        <option value="">— Select company —</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </FormSelect>

      <FormRow>
        <FormField label="Interview date" name="interview_date" type="datetime-local" defaultValue={defaultDateValue} />
        <FormSelect label="Status" name="status" defaultValue={defaultValues?.status ?? 'scheduled'}>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No show</option>
        </FormSelect>
      </FormRow>

      <FormRow>
        <FormSelect label="Channel" name="channel" defaultValue={defaultValues?.channel ?? ''}>
          <option value="">— Select —</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="in_person">In person</option>
          <option value="other">Other</option>
        </FormSelect>
        <FormSelect label="Why now" name="trigger_event" defaultValue={defaultValues?.trigger_event ?? ''}>
          <option value="">— Select trigger —</option>
          <option value="FASB_CHANGE">FASB change</option>
          <option value="EMPLOYEE_BTC_REQUEST">Employee BTC request</option>
          <option value="REGULATORY_UPDATE">Regulatory update</option>
          <option value="OTHER">Other</option>
        </FormSelect>
      </FormRow>

      <TagInput
        name="pain_points"
        label="Pain points"
        defaultValue={defaultValues?.pain_points ?? []}
        placeholder="Type a pain point, press Enter"
        hint="Press Enter or comma to add each pain point"
      />

      <FormTextarea label="Notes" name="notes" rows={4} defaultValue={defaultValues?.notes ?? ''} placeholder="Summary of the conversation…" />

      <FormField label="Email thread ID" name="email_thread_id" defaultValue={defaultValues?.email_thread_id ?? ''} placeholder="Optional — links to Fastmail thread" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
