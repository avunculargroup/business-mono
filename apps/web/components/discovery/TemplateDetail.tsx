'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { createTemplateVersion } from '@/app/actions/templates';
import { useToast } from '@/providers/ToastProvider';
import { TEMPLATE_TYPE_LABELS, type TemplateType, TEMPLATE_VERSION_STATUS_LABELS, type TemplateVersionStatus } from '@platform/shared';
import { formatRelativeDate } from '@/lib/utils';
import { Check, Plus } from 'lucide-react';
import type { TemplateRow, TemplateVersionRow } from './TemplatesList';
import styles from './TemplateDetail.module.css';

interface TemplateDetailProps {
  template: TemplateRow;
  onApproveVersion: (versionId: string) => void;
  onEdit: () => void;
}

const VERSION_STATUS_COLORS: Record<string, 'success' | 'warning' | 'neutral'> = {
  approved:   'success',
  draft:      'warning',
  deprecated: 'neutral',
};

export function TemplateDetail({ template, onApproveVersion, onEdit }: TemplateDetailProps) {
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [newContent, setNewContent]         = useState('');
  const [isSubmitting, setIsSubmitting]     = useState(false);

  const router  = useRouter();
  const { success, error } = useToast();

  const sortedVersions = [...template.mvp_template_versions].sort((a, b) => b.version_number - a.version_number);
  const latestVersion  = sortedVersions[0];

  const handleNewVersion = async () => {
    setIsSubmitting(true);
    const fd = new FormData();
    fd.set('content', newContent || JSON.stringify(latestVersion?.content ?? {}));
    const result = await createTemplateVersion(template.id, fd);
    setIsSubmitting(false);
    if (result.error) {
      error(result.error);
    } else {
      success(`Version ${result.version_number} created`);
      setShowNewVersion(false);
      setNewContent('');
      router.refresh();
    }
  };

  const renderContentPreview = (version: TemplateVersionRow) => {
    const content = version.content;
    if (Array.isArray((content as { sections?: unknown[] }).sections)) {
      return (
        <ol className={styles.sectionList}>
          {((content as { sections: { id: string; title: string; content: string }[] }).sections).map((s) => (
            <li key={s.id}><strong>{s.title}</strong> — {s.content}</li>
          ))}
        </ol>
      );
    }
    if (Array.isArray((content as { slides?: unknown[] }).slides)) {
      return (
        <ol className={styles.sectionList}>
          {((content as { slides: { id: string; title: string; content: string }[] }).slides).map((s) => (
            <li key={s.id}><strong>{s.title}</strong> — {s.content}</li>
          ))}
        </ol>
      );
    }
    return <pre className={styles.jsonPreview}>{JSON.stringify(content, null, 2)}</pre>;
  };

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
          <Button variant="secondary" size="sm" onClick={() => setShowNewVersion((p) => !p)}>
            <Plus size={14} strokeWidth={1.5} /> New version
          </Button>
        </div>

        {showNewVersion && (
          <div className={styles.newVersionForm}>
            <p className={styles.hint}>Edit the JSON content below, then save as a new draft.</p>
            <textarea
              className={styles.jsonEditor}
              rows={16}
              value={newContent || JSON.stringify(latestVersion?.content ?? {}, null, 2)}
              onChange={(e) => setNewContent(e.target.value)}
              spellCheck={false}
            />
            <div className={styles.newVersionActions}>
              <Button variant="secondary" size="sm" onClick={() => setShowNewVersion(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleNewVersion} loading={isSubmitting}>Save as draft</Button>
            </div>
          </div>
        )}

        {sortedVersions.map((version) => (
          <div key={version.id} className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={styles.versionNum}>v{version.version_number}</span>
              <StatusChip
                label={TEMPLATE_VERSION_STATUS_LABELS[version.status as TemplateVersionStatus] ?? version.status}
                color={VERSION_STATUS_COLORS[version.status] ?? 'neutral'}
              />
              <span className={styles.versionDate}>{formatRelativeDate(version.created_at)}</span>
              {version.status === 'draft' && (
                <Button variant="ghost" size="sm" onClick={() => onApproveVersion(version.id)}>
                  <Check size={14} strokeWidth={1.5} /> Approve
                </Button>
              )}
            </div>
            <div className={styles.contentPreview}>
              {renderContentPreview(version)}
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
