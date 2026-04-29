'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { importDocxDocument } from '@/app/actions/documents';
import { useToast } from '@/providers/ToastProvider';
import { Upload, FileText, X } from 'lucide-react';
import styles from './DocForm.module.css';
import importStyles from './ImportDocxForm.module.css';

interface ImportDocxFormProps {
  onSuccess: (id?: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportDocxForm({ onSuccess, onPendingChange }: ImportDocxFormProps) {
  const { success, error } = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
    setTagInput('');
  };

  const applyFile = (file: File) => {
    setSelectedFile(file);
    const base = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ');
    setTitle(base.charAt(0).toUpperCase() + base.slice(1));
  };

  const clearFile = () => {
    setSelectedFile(null);
    setTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.docx')) applyFile(file);
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('tags', JSON.stringify(tags));
    formData.set('title', title);
    if (selectedFile) formData.set('file', selectedFile);

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

        {selectedFile ? (
          <div className={importStyles.selectedFile}>
            <div className={importStyles.selectedFileIcon}>
              <FileText size={18} strokeWidth={1.5} />
            </div>
            <div className={importStyles.selectedFileInfo}>
              <div className={importStyles.selectedFileName}>{selectedFile.name}</div>
              <div className={importStyles.selectedFileSize}>{formatBytes(selectedFile.size)}</div>
            </div>
            <button type="button" className={importStyles.selectedFileClear} onClick={clearFile} aria-label="Remove file">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div
            className={`${importStyles.dropzone} ${dragOver ? importStyles.dragOver : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Drop a .docx file here or click to select"
          >
            <Upload size={24} strokeWidth={1.5} />
            <span className={importStyles.dropzoneText}>Drop a .docx file here or click to select</span>
            <span className={importStyles.dropzoneHint}>Word documents (.docx) only</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
