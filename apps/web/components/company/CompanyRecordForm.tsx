'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { RichTextToolbar } from '@/components/discovery/RichTextToolbar';
import { CompanyTypeForm } from './CompanyTypeForm';
import { createCompanyRecord, updateCompanyRecord, createCompanyUploadSignedUrl } from '@/app/actions/company';
import { createClient } from '@/lib/supabase/browser';
import { useToast } from '@/providers/ToastProvider';
import type { CompanyRecord, CompanyRecordType } from '@platform/shared';
import styles from './CompanyRecordForm.module.css';

interface CompanyRecordFormProps {
  open: boolean;
  onClose: () => void;
  recordTypes: CompanyRecordType[];
  editRecord: CompanyRecord | null;
  onTypesChanged: (types: CompanyRecordType[]) => void;
}

export function CompanyRecordForm({
  open,
  onClose,
  recordTypes,
  editRecord,
  onTypesChanged,
}: CompanyRecordFormProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [typeKey, setTypeKey] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedType = recordTypes.find((t) => t.key === typeKey);
  const contentType = selectedType?.content_type ?? 'text';

  const editor = useEditor({
    extensions: [StarterKit, Markdown.configure({ html: false })],
    content: '',
    editable: true,
    immediatelyRender: false,
  });

  // Reset form when record changes
  useEffect(() => {
    if (!open) return;
    if (editRecord) {
      setTypeKey(editRecord.type_key);
      setIsPinned(editRecord.is_pinned);
      setTextValue(editRecord.value ?? '');
      setPreviewUrl(null);
      setFile(null);
      if (editor && editRecord.type?.content_type === 'markdown') {
        editor.commands.setContent(editRecord.value ?? '');
      }
    } else {
      setTypeKey(recordTypes[0]?.key ?? '');
      setIsPinned(false);
      setTextValue('');
      setPreviewUrl(null);
      setFile(null);
      editor?.commands.setContent('');
    }
    setShowNewType(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRecord]);

  // Clear content when type changes
  useEffect(() => {
    if (!editRecord) {
      setTextValue('');
      editor?.commands.setContent('');
      setFile(null);
      setPreviewUrl(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && contentType === 'image') {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleTypeSelect = (value: string) => {
    if (value === '__new__') {
      setShowNewType(true);
    } else {
      setTypeKey(value);
      setShowNewType(false);
    }
  };

  const handleNewTypeCreated = (key: string, label: string) => {
    const newType: CompanyRecordType = {
      key,
      label,
      content_type: 'text',
      category: 'Custom',
      is_singleton: false,
      is_builtin: false,
      sort_order: 0,
      created_at: new Date().toISOString(),
    };
    onTypesChanged([...recordTypes, newType]);
    setTypeKey(key);
    setShowNewType(false);
  };

  const handleSubmit = async () => {
    if (!typeKey) return;
    setSaving(true);

    let storagePath: string | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;

    if (file && (contentType === 'image' || contentType === 'file')) {
      const urlResult = await createCompanyUploadSignedUrl(file.name, file.type);
      if ('error' in urlResult) {
        error(urlResult.error);
        setSaving(false);
        return;
      }
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.uploadToSignedUrl(
        'company-assets',
        urlResult.signedUrl,
        file,
        { contentType: file.type },
      );
      if (uploadError) {
        error(uploadError.message);
        setSaving(false);
        return;
      }
      storagePath = urlResult.path;
      filename = file.name;
      mimeType = file.type;
    }

    const value = contentType === 'markdown'
      ? (editor?.storage.markdown.getMarkdown() ?? '')
      : textValue;

    let result;
    if (editRecord) {
      result = await updateCompanyRecord(editRecord.id, {
        value: contentType !== 'image' && contentType !== 'file' ? value : (textValue || undefined),
        storage_path: storagePath,
        filename,
        mime_type: mimeType,
        is_pinned: isPinned,
      });
    } else {
      result = await createCompanyRecord({
        type_key: typeKey,
        value: contentType !== 'image' && contentType !== 'file' ? value : (textValue || undefined),
        storage_path: storagePath,
        filename,
        mime_type: mimeType,
        is_pinned: isPinned,
      });
    }

    setSaving(false);

    if ('error' in result) {
      error(result.error);
      return;
    }

    success(editRecord ? 'Record updated.' : 'Record added.');
    router.refresh();
    onClose();
  };

  // Group types by category for the select
  const grouped = recordTypes.reduce<Record<string, CompanyRecordType[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={editRecord ? 'Edit record' : 'Add record'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving} disabled={!typeKey}>
            {editRecord ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {/* Type select — disabled when editing */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="record-type">Type</label>
          <select
            id="record-type"
            className={styles.select}
            value={showNewType ? '__new__' : typeKey}
            onChange={(e) => handleTypeSelect(e.target.value)}
            disabled={!!editRecord}
          >
            {Object.entries(grouped).map(([cat, types]) => (
              <optgroup key={cat} label={cat}>
                {types.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </optgroup>
            ))}
            {!editRecord && (
              <optgroup label="──────────">
                <option value="__new__">+ Create new type…</option>
              </optgroup>
            )}
          </select>
        </div>

        {/* Inline new-type form */}
        {showNewType && (
          <CompanyTypeForm
            onCreated={handleNewTypeCreated}
            onCancel={() => setShowNewType(false)}
          />
        )}

        {/* Pin to top */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
          Pin to top of page
        </label>

        {/* Value field — conditional on content type */}
        {selectedType && contentType === 'text' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="record-value">Value</label>
            <textarea
              id="record-value"
              className={styles.textarea}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              rows={4}
              placeholder={`Enter ${selectedType.label.toLowerCase()}…`}
            />
          </div>
        )}

        {selectedType && contentType === 'markdown' && (
          <div className={styles.field}>
            <label className={styles.label}>Content</label>
            <div className={styles.editorWrap}>
              <RichTextToolbar editor={editor} />
              <EditorContent editor={editor} className={styles.editorContent} />
            </div>
          </div>
        )}

        {selectedType && contentType === 'image' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="record-image">Image file</label>
            <input
              id="record-image"
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
            {previewUrl && (
              <img src={previewUrl} alt="Preview" className={styles.imagePreview} />
            )}
            {!previewUrl && editRecord?.filename && (
              <p className={styles.existingFile}>Current: {editRecord.filename}</p>
            )}
            <div className={styles.field} style={{ marginTop: 'var(--space-2)' }}>
              <label className={styles.label} htmlFor="record-caption">Caption (optional)</label>
              <input
                id="record-caption"
                className={styles.input}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Image caption"
              />
            </div>
          </div>
        )}

        {selectedType && contentType === 'file' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="record-file">File</label>
            <input
              id="record-file"
              type="file"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
            {file && <p className={styles.existingFile}>Selected: {file.name}</p>}
            {!file && editRecord?.filename && (
              <p className={styles.existingFile}>Current: {editRecord.filename}</p>
            )}
            <div className={styles.field} style={{ marginTop: 'var(--space-2)' }}>
              <label className={styles.label} htmlFor="record-description">Description (optional)</label>
              <input
                id="record-description"
                className={styles.input}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="File description"
              />
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
