'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { updateTemplateVersion, createTemplateVersion } from '@/app/actions/templates';
import { useToast } from '@/providers/ToastProvider';
import { TEMPLATE_TYPE_LABELS, type TemplateType, TEMPLATE_VERSION_STATUS_LABELS, type TemplateVersionStatus } from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { TemplateRow, TemplateVersionRow } from './TemplatesList';
import styles from './TemplateDetail.module.css';

interface TemplateDetailProps {
  template: TemplateRow;
  onApproveVersion: (versionId: string) => void;
  onEdit: () => void;
}

type SectionRow = { id: string; title: string; content: string };

const VERSION_STATUS_COLORS: Record<string, 'success' | 'warning' | 'neutral'> = {
  approved:   'success',
  draft:      'warning',
  deprecated: 'neutral',
};

function extractRows(content: Record<string, unknown>): SectionRow[] {
  const sections = (content as { sections?: SectionRow[] }).sections;
  if (Array.isArray(sections)) return sections.map((s) => ({ id: s.id, title: s.title, content: s.content }));
  const slides = (content as { slides?: SectionRow[] }).slides;
  if (Array.isArray(slides)) return slides.map((s) => ({ id: s.id, title: s.title, content: s.content }));
  return [];
}

function buildContent(original: Record<string, unknown>, rows: SectionRow[]): Record<string, unknown> {
  if ((original as { sections?: unknown }).sections !== undefined) return { sections: rows };
  if ((original as { slides?: unknown }).slides !== undefined) return { slides: rows };
  return { sections: rows };
}

function ContentPreview({ version }: { version: TemplateVersionRow }) {
  const rows = extractRows(version.content);
  if (rows.length > 0) {
    return (
      <ol className={styles.sectionList}>
        {rows.map((s) => (
          <li key={s.id}><strong>{s.title}</strong> — {s.content}</li>
        ))}
      </ol>
    );
  }
  return <pre className={styles.jsonPreview}>{JSON.stringify(version.content, null, 2)}</pre>;
}

export function TemplateDetail({ template, onApproveVersion, onEdit }: TemplateDetailProps) {
  const [editingVersion, setEditingVersion] = useState<TemplateVersionRow | null>(null);
  const [editRows, setEditRows]             = useState<SectionRow[]>([]);
  const [isSubmitting, setIsSubmitting]     = useState(false);

  const router = useRouter();
  const { success, error } = useToast();

  const sortedVersions = [...template.mvp_template_versions].sort((a, b) => b.version_number - a.version_number);
  const itemLabel = editingVersion
    ? ((editingVersion.content as { sections?: unknown }).sections !== undefined ? 'section' : 'slide')
    : 'section';

  const startEdit = (version: TemplateVersionRow) => {
    setEditRows(extractRows(version.content));
    setEditingVersion(version);
  };

  const cancelEdit = () => {
    setEditingVersion(null);
    setEditRows([]);
  };

  const updateRow = (idx: number, field: 'title' | 'content', value: string) => {
    setEditRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx: number) => {
    setEditRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    setEditRows((prev) => [
      ...prev,
      { id: `${itemLabel}_${Date.now()}`, title: '', content: '' },
    ]);
  };

  const handleSave = async () => {
    if (!editingVersion) return;
    setIsSubmitting(true);

    const content = buildContent(editingVersion.content, editRows);

    if (editingVersion.status === 'draft') {
      const result = await updateTemplateVersion(editingVersion.id, content);
      setIsSubmitting(false);
      if (result.error) { error(result.error); return; }
      success('Draft saved');
    } else {
      const fd = new FormData();
      fd.set('content', JSON.stringify(content));
      const result = await createTemplateVersion(template.id, fd);
      setIsSubmitting(false);
      if (result.error) { error(result.error); return; }
      success(`Version ${result.version_number} created as draft`);
    }

    cancelEdit();
    router.refresh();
  };

  if (editingVersion) {
    return (
      <div className={styles.container}>
        <div className={styles.editorHeader}>
          <span className={styles.editorTitle}>
            Editing v{editingVersion.version_number}
            {editingVersion.status !== 'draft' && ' — will save as new draft'}
          </span>
          <button className={styles.iconBtn} onClick={cancelEdit} aria-label="Cancel editing">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className={styles.sectionEditor}>
          {editRows.map((row, idx) => (
            <div key={row.id} className={styles.sectionCard}>
              <div className={styles.sectionCardHeader}>
                <span className={styles.sectionNum}>{idx + 1}</span>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeRow(idx)}
                  aria-label={`Remove ${itemLabel} ${idx + 1}`}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
              <div className={styles.sectionFields}>
                <input
                  className={styles.sectionInput}
                  placeholder={`${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} title`}
                  value={row.title}
                  onChange={(e) => updateRow(idx, 'title', e.target.value)}
                />
                <textarea
                  className={styles.sectionTextarea}
                  placeholder="Guidance for this section…"
                  rows={3}
                  value={row.content}
                  onChange={(e) => updateRow(idx, 'content', e.target.value)}
                />
              </div>
            </div>
          ))}

          <button className={styles.addSectionBtn} onClick={addRow}>
            <Plus size={13} strokeWidth={2} />
            Add {itemLabel}
          </button>
        </div>

        <div className={styles.editorActions}>
          <Button variant="secondary" size="sm" onClick={cancelEdit}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSubmitting}>
            {editingVersion.status === 'draft' ? 'Save changes' : 'Save as new draft'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <StatusChip
          label={TEMPLATE_TYPE_LABELS[template.type as TemplateType] ?? template.type}
          color="neutral"
        />
        {template.tags.map((tag) => (
          <span key={tag} className={styles.tag}>{tag}</span>
        ))}
      </div>

      {template.description && (
        <p className={styles.desc}>{template.description}</p>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Versions</h3>
        </div>

        {sortedVersions.map((version) => (
          <div key={version.id} className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={styles.versionNum}>v{version.version_number}</span>
              <StatusChip
                label={TEMPLATE_VERSION_STATUS_LABELS[version.status as TemplateVersionStatus] ?? version.status}
                color={VERSION_STATUS_COLORS[version.status] ?? 'neutral'}
              />
              <span className={styles.versionDate}>{formatRelativeDate(version.created_at)}</span>
              <div className={styles.versionActions}>
                {version.status === 'draft' && (
                  <Button variant="ghost" size="sm" onClick={() => onApproveVersion(version.id)}>
                    <Check size={14} strokeWidth={1.5} /> Approve
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => startEdit(version)}>
                  <Pencil size={14} strokeWidth={1.5} />
                  {version.status === 'draft' ? 'Edit' : 'Fork'}
                </Button>
              </div>
            </div>
            <div className={styles.contentPreview}>
              <ContentPreview version={version} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onEdit}>Edit metadata</Button>
      </div>
    </div>
  );
}
