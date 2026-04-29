'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { SlideOver } from '@/components/ui/SlideOver';
import { DocForm } from './DocForm';
import { ImportDocxForm } from './ImportDocxForm';
import { formatRelativeDate } from '@/lib/utils';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@platform/shared';
import { ScrollText, Plus, ChevronDown, FileText, Upload, Eye, Pencil } from 'lucide-react';
import styles from './DocsList.module.css';

export type DocumentVersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  status: string;
  content: Record<string, unknown>;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  document_versions: DocumentVersionRow[];
};

const TYPE_COLORS: Record<string, 'neutral' | 'accent' | 'warning' | 'success'> = {
  report:   'neutral',
  proposal: 'warning',
  brief:    'accent',
  memo:     'neutral',
  strategy: 'success',
};

interface DocsListProps {
  initialDocuments: DocumentRow[];
}

export function DocsList({ initialDocuments }: DocsListProps) {
  const [documents] = useState(initialDocuments);
  const [showCreate,   setShowCreate]   = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [editDoc,      setEditDoc]      = useState<DocumentRow | null>(null);
  const [filterType,   setFilterType]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      if (filterType && d.type !== filterType) return false;
      return true;
    });
  }, [documents, filterType]);

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
            <option value="report">Report</option>
            <option value="proposal">Proposal</option>
            <option value="brief">Brief</option>
            <option value="memo">Memo</option>
            <option value="strategy">Strategy</option>
          </select>
        </div>
        <div ref={menuRef} className={styles.createMenu}>
          <Button variant="primary" size="sm" onClick={() => setMenuOpen((o) => !o)}>
            <Plus size={16} strokeWidth={1.5} />
            New document
            <ChevronDown size={14} strokeWidth={1.5} className={menuOpen ? styles.chevronOpen : styles.chevron} />
          </Button>
          {menuOpen && (
            <div className={styles.createDropdown}>
              <button
                className={styles.createOption}
                onClick={() => { setMenuOpen(false); setShowCreate(true); }}
              >
                <FileText size={15} strokeWidth={1.5} />
                New
              </button>
              <button
                className={styles.createOption}
                onClick={() => { setMenuOpen(false); setShowImport(true); }}
              >
                <Upload size={15} strokeWidth={1.5} />
                Import .docx
              </button>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <ScrollText size={48} strokeWidth={1} className={styles.emptyIcon} />
          <h3>No documents yet</h3>
          <p>Create your first report, proposal, brief, memo, or strategy doc.</p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>New document</Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((doc) => {
            const totalVersions = doc.document_versions.length;
            const hasApproved = doc.document_versions.some((v) => v.status === 'approved');

            return (
              <div key={doc.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <StatusChip
                    label={DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                    color={TYPE_COLORS[doc.type] ?? 'neutral'}
                  />
                  {hasApproved
                    ? <StatusChip label="Approved" color="success" />
                    : <StatusChip label="Draft" color="warning" />
                  }
                </div>
                <h3 className={styles.cardTitle}>{doc.title}</h3>
                {doc.description && (
                  <p className={styles.cardDesc}>{doc.description}</p>
                )}
                {doc.tags.length > 0 && (
                  <div className={styles.tags}>
                    {doc.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className={styles.cardFooter}>
                  <span className={styles.meta}>
                    {totalVersions} version{totalVersions !== 1 ? 's' : ''} · updated {formatRelativeDate(doc.updated_at)}
                  </span>
                  <div className={styles.cardActions}>
                    <Link
                      href={`/docs/${doc.id}`}
                      className={styles.viewLink}
                    >
                      <Eye size={14} strokeWidth={1.5} />
                      View
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => setEditDoc(doc)}>
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
        title="New document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="doc-form" loading={isSubmitting}>Create document</Button>
          </>
        }
      >
        <DocForm
          onSuccess={(id) => { setShowCreate(false); if (id) router.push(`/docs/${id}`); else router.refresh(); }}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Import .docx */}
      <SlideOver
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import .docx"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="import-docx-form" loading={isSubmitting}>Import document</Button>
          </>
        }
      >
        <ImportDocxForm
          onSuccess={(id) => { setShowImport(false); if (id) router.push(`/docs/${id}`); else router.refresh(); }}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit metadata */}
      <SlideOver
        open={!!editDoc}
        onClose={() => setEditDoc(null)}
        title="Edit document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="doc-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editDoc && (
          <DocForm
            key={editDoc.id}
            mode="edit"
            defaultValues={editDoc}
            onSuccess={() => { setEditDoc(null); router.refresh(); }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>
    </div>
  );
}
