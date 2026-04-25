'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createCompanyRecordType } from '@/app/actions/company';
import { useToast } from '@/providers/ToastProvider';
import styles from './CompanyTypeForm.module.css';

const CATEGORIES = ['Legal', 'Identity', 'Content', 'Documents', 'Custom'];
const CONTENT_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'markdown', label: 'Rich Text' },
  { value: 'image',    label: 'Image' },
  { value: 'file',     label: 'File' },
];

interface CompanyTypeFormProps {
  onCreated: (key: string, label: string) => void;
  onCancel: () => void;
}

export function CompanyTypeForm({ onCreated, onCancel }: CompanyTypeFormProps) {
  const [label, setLabel] = useState('');
  const [contentType, setContentType] = useState('text');
  const [category, setCategory] = useState('Custom');
  const [isSingleton, setIsSingleton] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error } = useToast();

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    const result = await createCompanyRecordType({
      label: label.trim(),
      content_type: contentType,
      category,
      is_singleton: isSingleton,
    });
    setSaving(false);
    if ('error' in result) {
      error(result.error);
      return;
    }
    onCreated(result.key, label.trim());
  };

  return (
    <div className={styles.container}>
      <p className={styles.heading}>New type</p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="type-label">Label</label>
          <input
            id="type-label"
            className={styles.input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Registered Office"
            autoFocus
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="type-content">Content</label>
            <select
              id="type-content"
              className={styles.select}
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="type-category">Category</label>
            <select
              id="type-category"
              className={styles.select}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isSingleton}
            onChange={(e) => setIsSingleton(e.target.checked)}
          />
          Only one record allowed (singleton)
        </label>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!label.trim()}>
          Create type
        </Button>
      </div>
    </div>
  );
}
