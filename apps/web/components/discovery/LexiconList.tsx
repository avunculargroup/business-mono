'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LexiconForm } from './LexiconForm';
import { approveLexiconEntry, deprecateLexiconEntry } from '@/app/actions/lexicon';
import { useToast } from '@/providers/ToastProvider';
import { formatRelativeDate } from '@/lib/utils';
import { LEXICON_STATUS_LABELS, type LexiconStatus } from '@platform/shared';
import { BookOpen, Pencil, Check, Archive, Plus } from 'lucide-react';
import styles from './LexiconList.module.css';

export type LexiconRow = {
  id: string;
  term: string;
  professional_term: string;
  definition: string | null;
  category: string | null;
  example_usage: string | null;
  status: string;
  version: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'neutral'> = {
  approved:   'success',
  draft:      'warning',
  deprecated: 'neutral',
};

interface LexiconListProps {
  initialEntries: LexiconRow[];
}

export function LexiconList({ initialEntries }: LexiconListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [showCreate, setShowCreate] = useState(false);
  const [editEntry, setEditEntry]   = useState<LexiconRow | null>(null);
  const [deprecateTarget, setDeprecateTarget] = useState<LexiconRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActioning,  setIsActioning]  = useState(false);

  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const router = useRouter();
  const { success, error } = useToast();

  const categories = useMemo(() => {
    const cats = new Set(entries.map((e) => e.category).filter(Boolean));
    return [...cats].sort() as string[];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (filterStatus   && e.status   !== filterStatus)   return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (q && !e.term.toLowerCase().includes(q) && !e.professional_term.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, filterStatus, filterCategory]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    router.refresh();
  }, [router]);

  const handleApprove = async (entry: LexiconRow) => {
    setIsActioning(true);
    const result = await approveLexiconEntry(entry.id);
    setIsActioning(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Entry approved');
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'approved' } : e));
    }
  };

  const handleDeprecate = async () => {
    if (!deprecateTarget) return;
    setIsActioning(true);
    const result = await deprecateLexiconEntry(deprecateTarget.id);
    setIsActioning(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Entry deprecated');
      setEntries((prev) => prev.map((e) => e.id === deprecateTarget.id ? { ...e, status: 'deprecated' } : e));
      setDeprecateTarget(null);
    }
  };

  const columns: Column<LexiconRow>[] = [
    {
      key: 'term',
      header: 'Term',
      width: '18%',
      render: (row) => <span className={styles.term}>{row.term}</span>,
    },
    {
      key: 'professional_term',
      header: 'Professional equivalent',
      width: '22%',
      render: (row) => <span className={styles.proTerm}>{row.professional_term}</span>,
    },
    {
      key: 'definition',
      header: 'Definition',
      width: '30%',
      render: (row) => (
        <span className={styles.definition}>{row.definition ?? <span className={styles.empty}>—</span>}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '10%',
      render: (row) => row.category
        ? <StatusChip label={row.category} color="neutral" />
        : <span className={styles.empty}>—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '10%',
      render: (row) => (
        <StatusChip
          label={LEXICON_STATUS_LABELS[row.status as LexiconStatus] ?? row.status}
          color={STATUS_COLORS[row.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'version',
      header: 'v',
      width: '6%',
      align: 'right',
      render: (row) => <span className={styles.version}>v{row.version}</span>,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      width: '10%',
      sortable: true,
      render: (row) => <span className={styles.date}>{formatRelativeDate(row.updated_at)}</span>,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search terms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="deprecated">Deprecated</option>
          </select>
          <select
            className={styles.filterSelect}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add term
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => setEditEntry(row)}
        rowActions={(row) => [
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditEntry(row),
          },
          ...(row.status !== 'approved' ? [{
            label: 'Approve',
            icon: <Check size={14} strokeWidth={1.5} />,
            onClick: () => handleApprove(row),
          }] : []),
          ...(row.status !== 'deprecated' ? [{
            label: 'Deprecate',
            icon: <Archive size={14} strokeWidth={1.5} />,
            onClick: () => setDeprecateTarget(row),
            destructive: true,
          }] : []),
        ]}
        pagination={{ page: 1, pageSize: 200, total: filtered.length, onPageChange: () => {} }}
        emptyState={
          <div className={styles.emptyState}>
            <BookOpen size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No lexicon entries yet</h3>
            <p>Add your first term to start building the corporate lexicon.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add term</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add lexicon entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="lexicon-form" loading={isSubmitting}>Save entry</Button>
          </>
        }
      >
        <LexiconForm onSuccess={handleCreated} onPendingChange={setIsSubmitting} />
      </SlideOver>

      {/* Edit */}
      <SlideOver
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        title="Edit lexicon entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="lexicon-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editEntry && (
          <LexiconForm
            key={editEntry.id}
            mode="edit"
            defaultValues={editEntry}
            onSuccess={() => { setEditEntry(null); router.refresh(); }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>

      {/* Deprecate confirm */}
      <ConfirmDialog
        open={!!deprecateTarget}
        onClose={() => setDeprecateTarget(null)}
        onConfirm={handleDeprecate}
        title="Deprecate entry"
        description={`Mark "${deprecateTarget?.term}" as deprecated? It will remain visible but flagged as outdated.`}
        confirmLabel="Deprecate"
        destructive
        loading={isActioning}
      />
    </div>
  );
}
