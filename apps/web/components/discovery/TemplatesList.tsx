'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { SlideOver } from '@/components/ui/SlideOver';
import { TemplateForm } from './TemplateForm';
import { formatRelativeDate } from '@/lib/utils';
import { TEMPLATE_TYPE_LABELS, type TemplateType } from '@platform/shared';
import { LayoutTemplate, Plus, Eye, Pencil } from 'lucide-react';
import styles from './TemplatesList.module.css';

export type TemplateVersionRow = {
  id: string;
  template_id: string;
  version_number: number;
  status: string;
  content: Record<string, unknown>;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export type TemplateRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  mvp_template_versions: TemplateVersionRow[];
};

const TYPE_COLORS: Record<string, 'neutral' | 'warning'> = {
  one_pager:     'neutral',
  briefing_deck: 'warning',
};

interface TemplatesListProps {
  initialTemplates: TemplateRow[];
}

export function TemplatesList({ initialTemplates }: TemplatesListProps) {
  const [templates] = useState(initialTemplates);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateRow | null>(null);
  const [filterType,   setFilterType]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (filterType && t.type !== filterType) return false;
      return true;
    });
  }, [templates, filterType]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All types</option>
            <option value="one_pager">One-pager</option>
            <option value="briefing_deck">Briefing deck</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New template
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <LayoutTemplate size={48} strokeWidth={1} className={styles.emptyIcon} />
          <h3>No templates yet</h3>
          <p>Create your first one-pager or briefing deck template.</p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>New template</Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((template) => {
            const totalVersions = template.mvp_template_versions.length;
            const hasApproved = template.mvp_template_versions.some((v) => v.status === 'approved');

            return (
              <div key={template.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <StatusChip
                    label={TEMPLATE_TYPE_LABELS[template.type as TemplateType] ?? template.type}
                    color={TYPE_COLORS[template.type] ?? 'neutral'}
                  />
                  {hasApproved
                    ? <StatusChip label="Approved" color="success" />
                    : <StatusChip label="Draft" color="warning" />
                  }
                </div>
                <h3 className={styles.cardTitle}>{template.title}</h3>
                {template.description && (
                  <p className={styles.cardDesc}>{template.description}</p>
                )}
                {template.tags.length > 0 && (
                  <div className={styles.tags}>
                    {template.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className={styles.cardFooter}>
                  <span className={styles.meta}>
                    {totalVersions} version{totalVersions !== 1 ? 's' : ''} · updated {formatRelativeDate(template.updated_at)}
                  </span>
                  <div className={styles.cardActions}>
                    <Link
                      href={`/discovery/templates/${template.id}`}
                      className={styles.viewLink}
                    >
                      <Eye size={14} strokeWidth={1.5} />
                      View
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => setEditTemplate(template)}>
                      <Pencil size={14} strokeWidth={1.5} /> Edit
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="template-form" loading={isSubmitting}>Create template</Button>
          </>
        }
      >
        <TemplateForm
          onSuccess={(id) => { setShowCreate(false); if (id) router.push(`/discovery/templates/${id}`); else router.refresh(); }}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit metadata */}
      <SlideOver
        open={!!editTemplate}
        onClose={() => setEditTemplate(null)}
        title="Edit template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTemplate(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="template-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editTemplate && (
          <TemplateForm
            key={editTemplate.id}
            mode="edit"
            defaultValues={editTemplate}
            onSuccess={() => { setEditTemplate(null); router.refresh(); }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>
    </div>
  );
}
