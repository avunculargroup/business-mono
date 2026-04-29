'use client';

import { useActionState, useEffect, useState } from 'react';
import { createTemplate, updateTemplate } from '@/app/actions/templates';
import { useToast } from '@/providers/ToastProvider';
import { X } from 'lucide-react';
import type { TemplateRow } from './TemplatesList';
import styles from './DiscoveryForm.module.css';

interface TemplateFormProps {
  onSuccess: (id?: string) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: TemplateRow;
}

export function TemplateForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: TemplateFormProps) {
  const { success, error } = useToast();
  const [tags, setTags] = useState<string[]>(defaultValues?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
    setTagInput('');
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('tags', JSON.stringify(tags));

    if (mode === 'edit' && defaultValues) {
      const result = await updateTemplate(defaultValues.id, formData);
      if (result.error) { error(result.error); return { error: result.error }; }
      success('Template updated');
      onSuccess();
      return null;
    }

    const result = await createTemplate(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Template created');
    onSuccess(result.template?.id);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'template-edit-form' : 'template-form';

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Type <span className={styles.required}>*</span></label>
        <select
          name="type"
          required
          defaultValue={defaultValues?.type ?? 'one_pager'}
          className={styles.select}
          disabled={mode === 'edit'}
        >
          <option value="one_pager">One-pager</option>
          <option value="briefing_deck">Briefing deck</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Title <span className={styles.required}>*</span></label>
        <input
          type="text"
          name="title"
          required
          defaultValue={defaultValues?.title ?? ''}
          className={styles.input}
          placeholder="e.g. Treasury Risk One-pager"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          className={styles.textarea}
          placeholder="Short description of when to use this template…"
        />
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
