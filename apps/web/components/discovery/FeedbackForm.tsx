'use client';

import { useActionState, useEffect, useState } from 'react';
import { createFeedback } from '@/app/actions/feedback';
import { useToast } from '@/providers/ToastProvider';
import { X } from 'lucide-react';
import type { FeedbackRow, PainPointOption, ContactOption, CompanyOption } from './FeedbackList';
import styles from './DiscoveryForm.module.css';

interface FeedbackFormProps {
  contacts: ContactOption[];
  companies: CompanyOption[];
  painPoints: PainPointOption[];
  onSuccess: (entry?: FeedbackRow) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function FeedbackForm({ contacts, companies, painPoints, onSuccess, onPendingChange }: FeedbackFormProps) {
  const { success, error } = useToast();
  const [tags, setTags]       = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags((p) => [...p, v]);
    setTagInput('');
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('tags', JSON.stringify(tags));
    const result = await createFeedback(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Feedback saved');
    onSuccess(result.entry as FeedbackRow);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id="feedback-form" action={formAction} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Source</label>
          <select name="source" defaultValue="interview" className={styles.select}>
            <option value="interview">Interview</option>
            <option value="survey">Survey</option>
            <option value="email">Email</option>
            <option value="testimonial">Testimonial</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select name="category" defaultValue="feature_request" className={styles.select}>
            <option value="bug_report">Bug report</option>
            <option value="feature_request">Feature request</option>
            <option value="usability">Usability</option>
            <option value="testimonial">Testimonial</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description <span className={styles.required}>*</span></label>
        <textarea name="description" required rows={5} className={styles.textarea} placeholder="What did they say?" />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Contact</label>
          <select name="contact_id" defaultValue="" className={styles.select}>
            <option value="">— Select contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="company_id" defaultValue="" className={styles.select}>
            <option value="">— Select company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {painPoints.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Related pain point</label>
          <select name="pain_point_id" defaultValue="" className={styles.select}>
            <option value="">— Link to pain point —</option>
            {painPoints.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.content.slice(0, 60)}{pp.content.length > 60 ? '…' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Date received</label>
          <input type="date" name="date_received" className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Rating (1–5)</label>
          <input type="number" name="rating" min={1} max={5} className={styles.input} placeholder="Optional" />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Tags</label>
        <div className={styles.chipArea}>
          {tags.map((tag) => (
            <span key={tag} className={styles.chip}>
              {tag}
              <button type="button" className={styles.chipRemove} onClick={() => setTags((p) => p.filter((t) => t !== tag))}>
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
            placeholder={tags.length === 0 ? 'Add tags…' : 'Add another…'}
            className={styles.chipInput}
          />
        </div>
        <input type="hidden" name="tags" value={JSON.stringify(tags)} />
        <span className={styles.hint}>Press Enter or comma to add tags</span>
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
