'use client';

import { createFeedback } from '@/app/actions/feedback';
import type { FeedbackRow, PainPointOption, ContactOption, CompanyOption } from './FeedbackList';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import { TagInput } from '@/components/ui/TagInput';
import styles from '@/components/ui/Form.module.css';

interface FeedbackFormProps {
  contacts: ContactOption[];
  companies: CompanyOption[];
  painPoints: PainPointOption[];
  onSuccess: (entry?: FeedbackRow) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function FeedbackForm({ contacts, companies, painPoints, onSuccess, onPendingChange }: FeedbackFormProps) {
  const { state, formAction } = useEntityForm({
    mode: 'create',
    entityLabel: 'Feedback',
    create: createFeedback,
    onSuccess: (result) => onSuccess(result.entry as FeedbackRow | undefined),
    onPendingChange,
  });

  return (
    <form id="feedback-form" action={formAction} className={styles.form}>
      <FormRow>
        <FormSelect label="Source" name="source" defaultValue="interview">
          <option value="interview">Interview</option>
          <option value="survey">Survey</option>
          <option value="email">Email</option>
          <option value="testimonial">Testimonial</option>
        </FormSelect>
        <FormSelect label="Category" name="category" defaultValue="feature_request">
          <option value="bug_report">Bug report</option>
          <option value="feature_request">Feature request</option>
          <option value="usability">Usability</option>
          <option value="testimonial">Testimonial</option>
        </FormSelect>
      </FormRow>

      <FormTextarea label="Description" name="description" required rows={5} placeholder="What did they say?" />

      <FormRow>
        <FormSelect label="Contact" name="contact_id" defaultValue="">
          <option value="">— Select contact —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </FormSelect>
        <FormSelect label="Company" name="company_id" defaultValue="">
          <option value="">— Select company —</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FormSelect>
      </FormRow>

      {painPoints.length > 0 && (
        <FormSelect label="Related pain point" name="pain_point_id" defaultValue="">
          <option value="">— Link to pain point —</option>
          {painPoints.map((pp) => (
            <option key={pp.id} value={pp.id}>
              {pp.content.slice(0, 60)}{pp.content.length > 60 ? '…' : ''}
            </option>
          ))}
        </FormSelect>
      )}

      <FormRow>
        <FormField label="Date received" name="date_received" type="date" />
        <FormField label="Rating (1–5)" name="rating" type="number" min={1} max={5} placeholder="Optional" />
      </FormRow>

      <TagInput
        name="tags"
        label="Tags"
        placeholder="Add tags…"
        hint="Press Enter or comma to add tags"
        transform={(s) => s.trim().toLowerCase()}
      />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
