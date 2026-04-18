'use client';

import { useActionState, useEffect, useState, useRef } from 'react';
import { createInterview, updateInterview } from '@/app/actions/interviews';
import { useToast } from '@/providers/ToastProvider';
import { X } from 'lucide-react';
import type { InterviewRow } from './InterviewsList';
import styles from './InterviewForm.module.css';

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
  const { success, error } = useToast();

  const [chips, setChips] = useState<string[]>(defaultValues?.pain_points ?? []);
  const [chipInput, setChipInput] = useState('');
  const chipInputRef = useRef<HTMLInputElement>(null);

  const addChip = () => {
    const value = chipInput.trim();
    if (value && !chips.includes(value)) {
      setChips((prev) => [...prev, value]);
    }
    setChipInput('');
    chipInputRef.current?.focus();
  };

  const removeChip = (chip: string) => {
    setChips((prev) => prev.filter((c) => c !== chip));
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('pain_points', JSON.stringify(chips));

    if (mode === 'edit' && defaultValues) {
      const result = await updateInterview(defaultValues.id, formData);
      if (result.error) {
        error(result.error);
        return { error: result.error };
      }
      success('Interview updated');
      onSuccess();
      return null;
    }

    const result = await createInterview(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Interview scheduled');
    onSuccess(result.interview as InterviewRow);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'interview-edit-form' : 'interview-form';

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  // Format interview_date for datetime-local input (requires "YYYY-MM-DDTHH:MM")
  const defaultDateValue = defaultValues?.interview_date
    ? new Date(defaultValues.interview_date).toISOString().slice(0, 16)
    : '';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Contact</label>
        <select
          name="contact_id"
          defaultValue={defaultValues?.contact_id ?? ''}
          className={styles.select}
        >
          <option value="">— Select contact —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Company</label>
        <select
          name="company_id"
          defaultValue={defaultValues?.company_id ?? ''}
          className={styles.select}
        >
          <option value="">— Select company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Interview date</label>
          <input
            type="datetime-local"
            name="interview_date"
            defaultValue={defaultDateValue}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <select
            name="status"
            defaultValue={defaultValues?.status ?? 'scheduled'}
            className={styles.select}
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No show</option>
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Channel</label>
          <select
            name="channel"
            defaultValue={defaultValues?.channel ?? ''}
            className={styles.select}
          >
            <option value="">— Select —</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="in_person">In person</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Why now</label>
          <select
            name="trigger_event"
            defaultValue={defaultValues?.trigger_event ?? ''}
            className={styles.select}
          >
            <option value="">— Select trigger —</option>
            <option value="FASB_CHANGE">FASB change</option>
            <option value="EMPLOYEE_BTC_REQUEST">Employee BTC request</option>
            <option value="REGULATORY_UPDATE">Regulatory update</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Pain points</label>
        <div className={styles.chipArea}>
          {chips.map((chip) => (
            <span key={chip} className={styles.chip}>
              {chip}
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => removeChip(chip)}
                aria-label={`Remove "${chip}"`}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            ref={chipInputRef}
            type="text"
            value={chipInput}
            onChange={(e) => setChipInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addChip();
              }
            }}
            placeholder={chips.length === 0 ? 'Type a pain point, press Enter' : 'Add another…'}
            className={styles.chipInput}
          />
        </div>
        <input type="hidden" name="pain_points" value={JSON.stringify(chips)} />
        <span className={styles.hint}>Press Enter or comma to add each pain point</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={defaultValues?.notes ?? ''}
          className={styles.textarea}
          placeholder="Summary of the conversation…"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Email thread ID</label>
        <input
          type="text"
          name="email_thread_id"
          defaultValue={defaultValues?.email_thread_id ?? ''}
          className={styles.input}
          placeholder="Optional — links to Fastmail thread"
        />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
