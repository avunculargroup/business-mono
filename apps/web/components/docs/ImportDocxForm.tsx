'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { importDocxDocument } from '@/app/actions/documents';
import { useToast } from '@/providers/ToastProvider';
import { Upload, X } from 'lucide-react';
import styles from './DocForm.module.css';
import importStyles from './ImportDocxForm.module.css';

interface ImportDocxFormProps {
  onSuccess: (id?: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ImportDocxForm({ onSuccess, onPendingChange }: ImportDocxFormProps) {
  const { success, error } = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
    setTagInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setFileName(''); setTitle(''); return; }
    setFileName(file.name);
    // Pre-fill title from filename (strip .docx extension)
    const base = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ');
    setTitle(base.charAt(0).toUpperCase() + base.slice(1));
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('tags', JSON.stringify(tags));
    formData.set('title', title);

    const result = await importDocxDocument(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Document imported');
    onSuccess(result.document?.id);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id="import-docx-form" action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>File <span className={styles.required}>*</span></label>
        <div
          className={importStyles.dropZone}
          onClick={() => fileInputRef.current?.click()}
        >
          {fileName ? (
            <span className={importStyles.fileName}>{fileName}</span>
          ) : (
            <>
              <Upload size={20} strokeWidth={1.5} className={importStyles.uploadIcon} />
              <span>Click to choose a .docx file</span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          className={importStyles.hiddenInput}
          onChange={handleFileChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Type <span className={styles.required}>*</span></label>
        <select name="type" required defaultValue="report" className={styles.select}>
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={styles.input}
          placeholder="Document title"
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
