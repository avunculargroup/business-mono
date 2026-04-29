'use client';

import { useActionState, useEffect, useState } from 'react';
import { createDocument, updateDocument } from '@/app/actions/documents';
import { useToast } from '@/providers/ToastProvider';
import { X } from 'lucide-react';
import type { DocumentRow } from './DocsList';
import styles from './DocForm.module.css';

interface DocFormProps {
  onSuccess: (id?: string) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: DocumentRow;
}

export function DocForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: DocFormProps) {
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
      const result = await updateDocument(defaultValues.id, formData);
      if (result.error) { error(result.error); return { error: result.error }; }
      success('Document updated');
      onSuccess();
      return null;
    }

    const result = await createDocument(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Document created');
    onSuccess(result.document?.id);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'doc-edit-form' : 'doc-form';

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Type <span className={styles.required}>*</span></label>
        <select
          name="type"
          required
          defaultValue={defaultValues?.type ?? 'report'}
          className={styles.select}
        >
          <option value="report">Report</option>
          <option value="proposal">Proposal</option>
          <option value="brief">Brief</option>
          <option value="memo">Memo</option>
          <option value="strategy">Strategy</option>
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
          placeholder="e.g. Q2 Treasury Strategy Review"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          className={styles.textarea}
          placeholder="Short description of this document's purpose…"
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
