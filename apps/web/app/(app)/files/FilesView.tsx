'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, Search, X, Download, Pencil, Trash2, Eye, EyeOff,
  FileText, FileImage, File, Tag, Plus, Files,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/providers/ToastProvider';
import type { PlatformFile } from '@/app/actions/files';
import {
  createFileUploadUrl,
  registerFile,
  renameFile as renameFileAction,
  updateFileTags,
  updateFileVisibility,
  deleteFile,
  getFileDownloadUrl,
  getFiles,
} from '@/app/actions/files';
import styles from './files.module.css';

// ── Constants ──────────────────────────────────────────────

const SUGGESTED_TAGS = [
  'proposal', 'contract', 'financial', 'report', 'presentation',
  'brand', 'research', 'marketing', 'bitcoin', 'client', 'template', 'internal',
];

// ── Helpers ────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

function getFileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'file';
}

function FileIcon({ mime, size = 32 }: { mime: string; size?: number }) {
  if (isImage(mime)) return <FileImage size={size} strokeWidth={1.5} />;
  if (isPdf(mime)) return <FileText size={size} strokeWidth={1.5} />;
  return <File size={size} strokeWidth={1.5} />;
}

function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(file);
  });
}

// ── Types ──────────────────────────────────────────────────

interface PendingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

// ── Tag input sub-component ────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder = 'Add a tag…',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = useCallback((raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
  }, [tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  const toggleSuggested = (tag: string) => {
    if (tags.includes(tag)) onChange(tags.filter((t) => t !== tag));
    else onChange([...tags, tag]);
  };

  return (
    <div>
      <div className={styles.suggestedTags}>
        {SUGGESTED_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.suggestedTag} ${tags.includes(t) ? styles.selected : ''}`}
            onClick={() => toggleSuggested(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={styles.tagsRow}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tagPill}>
            {tag}
            <button
              type="button"
              className={styles.tagPillRemove}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
            >
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          className={styles.tagInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input && addTag(input)}
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export function FilesView({ initialFiles }: { initialFiles: PlatformFile[] }) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDialogRef = useRef<HTMLDialogElement>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  const [files, setFiles] = useState<PlatformFile[]>(initialFiles);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'documents'>('all');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Modals
  const [previewFile, setPreviewFile] = useState<PlatformFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<PlatformFile | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [tagsTarget, setTagsTarget] = useState<PlatformFile | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync upload dialog open/close
  useEffect(() => {
    const dialog = uploadDialogRef.current;
    if (!dialog) return;
    if (uploadOpen) dialog.showModal();
    else dialog.close();
  }, [uploadOpen]);

  // Sync preview dialog open/close
  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;
    if (previewFile) dialog.showModal();
    else dialog.close();
  }, [previewFile]);

  // Close dialogs on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewFile) { setPreviewFile(null); return; }
      if (uploadOpen) { setUploadOpen(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [previewFile, uploadOpen]);

  // ── Filtered file list ──────────────────────────────────

  const filtered = files.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType === 'images' && !isImage(f.mime_type)) return false;
    if (filterType === 'documents' && !isPdf(f.mime_type)) return false;
    if (filterVisibility === 'public' && !f.is_public) return false;
    if (filterVisibility === 'private' && f.is_public) return false;
    if (filterTags.length && !filterTags.every((t) => f.tags.includes(t))) return false;
    return true;
  });

  // All unique tags across all files (for filter dropdown)
  const allTags = Array.from(new Set(files.flatMap((f) => f.tags))).sort();

  // ── Upload handlers ─────────────────────────────────────

  const addPendingFiles = (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const next: PendingFile[] = arr.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setPendingFiles((prev) => [...prev, ...next]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addPendingFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);

    let anyError = false;

    for (const pf of pendingFiles) {
      // Mark uploading
      setPendingFiles((prev) =>
        prev.map((p) => (p.id === pf.id ? { ...p, status: 'uploading' } : p)),
      );

      const urlResult = await createFileUploadUrl(pf.file.name);
      if ('error' in urlResult) {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pf.id ? { ...p, status: 'error', error: urlResult.error } : p)),
        );
        anyError = true;
        continue;
      }

      try {
        await uploadWithProgress(urlResult.signedUrl, pf.file, (pct) => {
          setPendingFiles((prev) =>
            prev.map((p) => (p.id === pf.id ? { ...p, progress: pct } : p)),
          );
        });
      } catch {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pf.id ? { ...p, status: 'error', error: 'Upload failed' } : p)),
        );
        anyError = true;
        continue;
      }

      const displayName = pf.file.name.replace(/\.[^/.]+$/, '');
      const reg = await registerFile({
        fileId: urlResult.fileId,
        name: displayName,
        originalFilename: pf.file.name,
        storagePath: urlResult.path,
        mimeType: pf.file.type || 'application/octet-stream',
        byteSize: pf.file.size,
        tags: uploadTags,
      });

      if ('error' in reg) {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pf.id ? { ...p, status: 'error', error: reg.error } : p)),
        );
        anyError = true;
      } else {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pf.id ? { ...p, status: 'done', progress: 100 } : p)),
        );
      }
    }

    setUploading(false);

    if (!anyError) {
      toast.success(`${pendingFiles.length === 1 ? '1 file' : `${pendingFiles.length} files`} uploaded`);
      setUploadOpen(false);
      setPendingFiles([]);
      setUploadTags([]);
      // Refresh with fresh signed URLs
      const { files: fresh } = await getFiles();
      setFiles(fresh);
    } else {
      toast.error('Some files failed to upload');
    }
  };

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setPendingFiles([]);
    setUploadTags([]);
  };

  // ── File action handlers ────────────────────────────────

  const handleDownload = async (file: PlatformFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await getFileDownloadUrl(file.id);
    if ('error' in result) { toast.error(result.error); return; }
    const a = document.createElement('a');
    a.href = result.url;
    a.download = file.name;
    a.click();
  };

  const handleToggleVisibility = async (file: PlatformFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !file.is_public;
    // Optimistic
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, is_public: next } : f)));
    const result = await updateFileVisibility(file.id, next);
    if (result.error) {
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, is_public: file.is_public } : f)));
      toast.error(result.error);
    } else {
      toast.success(next ? 'File set to public' : 'File set to private');
    }
  };

  const openRename = (file: PlatformFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameTarget(file);
    setRenameName(file.name);
    setRenameError('');
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    setRenaming(true);
    const result = await renameFileAction(renameTarget.id, renameName);
    setRenaming(false);
    if (result.error) { setRenameError(result.error); return; }
    setFiles((prev) => prev.map((f) => (f.id === renameTarget.id ? { ...f, name: renameName.trim() } : f)));
    toast.success('File renamed');
    setRenameTarget(null);
  };

  const openTagsEdit = (file: PlatformFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagsTarget(file);
    setEditTags([...file.tags]);
  };

  const handleSaveTags = async () => {
    if (!tagsTarget) return;
    setSavingTags(true);
    const result = await updateFileTags(tagsTarget.id, editTags);
    setSavingTags(false);
    if (result.error) { toast.error(result.error); return; }
    setFiles((prev) => prev.map((f) => (f.id === tagsTarget.id ? { ...f, tags: editTags } : f)));
    toast.success('Tags updated');
    setTagsTarget(null);
  };

  const handleDelete = async (file: PlatformFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    setDeletingId(file.id);
    const result = await deleteFile(file.id);
    setDeletingId(null);
    if (result.error) { toast.error(result.error); return; }
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    toast.success('File deleted');
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={14} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="images">Images</option>
            <option value="documents">PDFs</option>
          </select>

          <select
            className={styles.filterSelect}
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value as typeof filterVisibility)}
            aria-label="Filter by visibility"
          >
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>

          {allTags.length > 0 && (
            <select
              className={styles.filterSelect}
              value=""
              onChange={(e) => {
                const tag = e.target.value;
                if (tag && !filterTags.includes(tag)) setFilterTags((prev) => [...prev, tag]);
                e.target.value = '';
              }}
              aria-label="Filter by tag"
            >
              <option value="">Filter by tag…</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.spacer} />

        <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload size={14} strokeWidth={1.5} />
          Upload files
        </Button>
      </div>

      {/* ── Active filter chips ── */}
      {filterTags.length > 0 && (
        <div className={styles.activeFilters}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Tags:</span>
          {filterTags.map((tag) => (
            <span key={tag} className={styles.filterChip}>
              {tag}
              <button
                type="button"
                className={styles.filterChipRemove}
                onClick={() => setFilterTags((prev) => prev.filter((t) => t !== tag))}
                aria-label={`Remove tag filter ${tag}`}
              >
                <X size={10} strokeWidth={2} />
              </button>
            </span>
          ))}
          <button
            type="button"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setFilterTags([])}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Count ── */}
      {files.length > 0 && (
        <p className={styles.count}>
          {filtered.length === files.length
            ? `${files.length} file${files.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${files.length} files`}
        </p>
      )}

      {/* ── Grid ── */}
      {filtered.length > 0 ? (
        <div className={styles.grid}>
          {filtered.map((file) => (
            <div
              key={file.id}
              className={styles.card}
              onClick={() => setPreviewFile(file)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setPreviewFile(file)}
              aria-label={`Preview ${file.name}`}
            >
              {/* Preview area */}
              <div className={styles.preview}>
                {isImage(file.mime_type) && file.signed_url ? (
                  <img
                    src={file.signed_url}
                    alt={file.name}
                    className={styles.previewImg}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.previewIcon}>
                    <FileIcon mime={file.mime_type} size={36} />
                    <span className={styles.previewIconExt}>{getFileExt(file.original_filename)}</span>
                  </div>
                )}
              </div>

              {/* Card info */}
              <div className={styles.cardInfo}>
                <div className={styles.cardName} title={file.name}>{file.name}</div>
                <div className={styles.cardMeta}>
                  <span>{formatBytes(file.byte_size)}</span>
                  <span
                    className={`${styles.visibilityBadge} ${file.is_public ? styles.public : styles.private}`}
                  >
                    {file.is_public ? <Eye size={9} strokeWidth={2} /> : <EyeOff size={9} strokeWidth={2} />}
                    {file.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
                {file.tags.length > 0 && (
                  <div className={styles.cardTags}>
                    {file.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                    {file.tags.length > 3 && (
                      <span className={styles.tag}>+{file.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Hover actions */}
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={(e) => handleToggleVisibility(file, e)}
                  aria-label={file.is_public ? 'Set private' : 'Set public'}
                  title={file.is_public ? 'Set private' : 'Set public'}
                >
                  {file.is_public
                    ? <EyeOff size={13} strokeWidth={1.5} />
                    : <Eye size={13} strokeWidth={1.5} />}
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={(e) => openTagsEdit(file, e)}
                  aria-label="Edit tags"
                  title="Edit tags"
                >
                  <Tag size={13} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={(e) => openRename(file, e)}
                  aria-label="Rename"
                  title="Rename"
                >
                  <Pencil size={13} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={(e) => handleDownload(file, e)}
                  aria-label="Download"
                  title="Download"
                >
                  <Download size={13} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.destructive}`}
                  onClick={(e) => handleDelete(file, e)}
                  disabled={deletingId === file.id}
                  aria-label="Delete file"
                  title="Delete"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <Files size={48} strokeWidth={1} />
          <h3>{files.length === 0 ? 'No files yet' : 'No files match these filters'}</h3>
          <p>
            {files.length === 0
              ? 'Upload PDFs, images, and documents to keep everything in one place.'
              : 'Try adjusting your search or filters.'}
          </p>
          {files.length === 0 && (
            <Button variant="primary" onClick={() => setUploadOpen(true)}>
              <Upload size={16} strokeWidth={1.5} />
              Upload files
            </Button>
          )}
        </div>
      )}

      {/* ── Upload dialog ── */}
      <dialog
        ref={uploadDialogRef}
        className={styles.uploadDialog}
        onClose={closeUpload}
      >
        <div className={styles.uploadPanel}>
          <div className={styles.uploadHeader}>
            <span className={styles.uploadTitle}>Upload files</span>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={closeUpload}
              disabled={uploading}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className={styles.uploadBody}>
            {/* Dropzone */}
            <div
              className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Drop files here or click to select"
            >
              <Upload size={24} strokeWidth={1.5} />
              <span className={styles.dropzoneText}>
                {dragOver ? 'Drop to add files' : 'Drop files here or click to select'}
              </span>
              <span className={styles.dropzoneHint}>
                PDF, PNG, JPEG, SVG, and more — multiple files supported
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className={styles.hiddenInput}
              onChange={(e) => e.target.files && addPendingFiles(e.target.files)}
            />

            {/* Pending file list */}
            {pendingFiles.length > 0 && (
              <div className={styles.uploadList}>
                {pendingFiles.map((pf) => (
                  <div key={pf.id} className={styles.uploadItem}>
                    <div className={styles.uploadItemIcon}>
                      <FileIcon mime={pf.file.type} size={20} />
                    </div>
                    <div className={styles.uploadItemInfo}>
                      <div className={styles.uploadItemName}>{pf.file.name}</div>
                      <div className={styles.uploadItemSize}>{formatBytes(pf.file.size)}</div>
                      {pf.status === 'uploading' && (
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${pf.progress}%` }} />
                        </div>
                      )}
                      {pf.status === 'error' && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-destructive)', marginTop: 2 }}>
                          {pf.error ?? 'Upload failed'}
                        </div>
                      )}
                    </div>
                    {pf.status !== 'uploading' && pf.status !== 'done' && (
                      <button
                        type="button"
                        className={styles.uploadItemRemove}
                        onClick={() => setPendingFiles((prev) => prev.filter((p) => p.id !== pf.id))}
                        aria-label={`Remove ${pf.file.name}`}
                      >
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tags */}
            <div>
              <label className={styles.label}>
                Tags
                <span className={styles.labelHint}>— applied to all files in this upload</span>
              </label>
              <TagInput tags={uploadTags} onChange={setUploadTags} />
            </div>
          </div>

          <div className={styles.uploadFooter}>
            <Button variant="secondary" onClick={closeUpload} disabled={uploading}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              loading={uploading}
              disabled={pendingFiles.length === 0 || uploading}
            >
              <Upload size={14} strokeWidth={1.5} />
              {uploading ? 'Uploading…' : `Upload ${pendingFiles.length > 0 ? `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}` : 'files'}`}
            </Button>
          </div>
        </div>
      </dialog>

      {/* ── Preview dialog ── */}
      <dialog
        ref={previewDialogRef}
        className={styles.previewDialog}
        onClose={() => setPreviewFile(null)}
      >
        {previewFile && (
          <div className={styles.previewPanelWrap}>
            <div className={styles.previewPanelHeader}>
              <span className={styles.previewPanelTitle}>{previewFile.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDownload(previewFile, e)}
                  aria-label="Download file"
                >
                  <Download size={14} strokeWidth={1.5} />
                  Download
                </Button>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setPreviewFile(null)}
                  aria-label="Close preview"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className={styles.previewContent}>
              {isImage(previewFile.mime_type) && previewFile.signed_url ? (
                <img
                  src={previewFile.signed_url}
                  alt={previewFile.name}
                  className={styles.previewContentImg}
                />
              ) : isPdf(previewFile.mime_type) && previewFile.signed_url ? (
                <iframe
                  src={previewFile.signed_url}
                  className={styles.previewContentPdf}
                  title={previewFile.name}
                />
              ) : (
                <div className={styles.previewIcon} style={{ gap: 'var(--space-3)', padding: 'var(--space-12)' }}>
                  <FileIcon mime={previewFile.mime_type} size={48} />
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                    No preview available
                  </span>
                </div>
              )}
            </div>

            <div className={styles.previewMeta}>
              <span className={styles.previewMetaItem}>
                <span className={styles.previewMetaLabel}>Size</span>
                {formatBytes(previewFile.byte_size)}
              </span>
              <span className={styles.previewMetaItem}>
                <span className={styles.previewMetaLabel}>Type</span>
                {previewFile.mime_type}
              </span>
              <span className={styles.previewMetaItem}>
                <span className={styles.previewMetaLabel}>Visibility</span>
                {previewFile.is_public ? 'Public' : 'Private'}
              </span>
              {previewFile.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                  {previewFile.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>

      {/* ── Rename modal ── */}
      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="Rename file"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleRename} loading={renaming}>Save</Button>
          </>
        }
      >
        <div className={styles.formField}>
          <label className={styles.label} htmlFor="rename-input">File name</label>
          <input
            id="rename-input"
            className={styles.textInput}
            value={renameName}
            onChange={(e) => { setRenameName(e.target.value); setRenameError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          {renameError && <span className={styles.errorMsg}>{renameError}</span>}
        </div>
      </Modal>

      {/* ── Edit tags modal ── */}
      <Modal
        open={!!tagsTarget}
        onClose={() => setTagsTarget(null)}
        title="Edit tags"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTagsTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveTags} loading={savingTags}>Save tags</Button>
          </>
        }
      >
        <div className={styles.formField}>
          <label className={styles.label}>Tags</label>
          <TagInput tags={editTags} onChange={setEditTags} />
        </div>
      </Modal>

    </div>
  );
}
