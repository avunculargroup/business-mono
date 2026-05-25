'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NewsSourceForm, type NewsSourceFormValues } from './NewsSourceForm';
import {
  createNewsSource,
  updateNewsSource,
  deleteNewsSource,
  toggleNewsSourceActive,
} from '@/app/actions/newsSources';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate } from '@/lib/utils';
import { useToast } from '@/providers/ToastProvider';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionsMenu';
import type { NewsSourceRecord } from '@platform/shared';
import styles from './sources.module.css';

interface Props {
  initialSources: NewsSourceRecord[];
}

function statusColor(status: string | null): 'neutral' | 'success' | 'destructive' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'destructive';
  return 'neutral';
}

function valuesToFormData(v: NewsSourceFormValues): FormData {
  const fd = new FormData();
  fd.set('name', v.name);
  fd.set('site_url', v.site_url);
  fd.set('feed_url', v.feed_url);
  fd.set('is_active', v.is_active ? 'true' : 'false');
  return fd;
}

export function NewsSourcesClient({ initialSources }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editSource, setEditSource] = useState<NewsSourceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NewsSourceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { success, error } = useToast();
  const { items: sources, optimisticUpdate, optimisticRemove } = useOptimisticList(initialSources);

  const handleCreate = async (values: NewsSourceFormValues) => {
    setSubmitting(true);
    const result = await createNewsSource(valuesToFormData(values));
    setSubmitting(false);
    if (result.error) return error(result.error);
    success('Source added');
    setShowCreate(false);
  };

  const handleUpdate = async (values: NewsSourceFormValues) => {
    if (!editSource) return;
    setSubmitting(true);
    const result = await updateNewsSource(editSource.id, valuesToFormData(values));
    setSubmitting(false);
    if (result.error) return error(result.error);
    success('Source updated');
    setEditSource(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const id = deleteTarget.id;
    const result = await deleteNewsSource(id);
    setIsDeleting(false);
    if (result.error) return error(result.error);
    success('Source removed');
    optimisticRemove(id, async () => {});
    setDeleteTarget(null);
  };

  const handleToggleActive = async (row: NewsSourceRecord) => {
    const next = !row.is_active;
    optimisticUpdate(row.id, { is_active: next }, async () => {
      const result = await toggleNewsSourceActive(row.id, next);
      if (result.error) error(result.error);
    });
  };

  const columns: Column<NewsSourceRecord>[] = [
    {
      key: 'name',
      header: 'Source',
      render: (r) => (
        <div className={styles.nameCell}>
          <span className={styles.nameText}>{r.name}</span>
          <a
            className={styles.nameSub}
            href={r.feed_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {r.feed_url} <ExternalLink size={11} strokeWidth={1.5} />
          </a>
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last scanned',
      render: (r) =>
        r.last_scanned_at ? (
          <div className={styles.lastCell}>
            <span className={styles.muted}>{formatRelativeDate(r.last_scanned_at)}</span>
            {r.last_status && <StatusChip label={r.last_status} color={statusColor(r.last_status)} />}
          </div>
        ) : (
          <span className={styles.muted}>Never</span>
        ),
      width: '200px',
    },
    {
      key: 'active',
      header: 'Active',
      render: (r) => (
        <label className={styles.toggle} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={r.is_active} onChange={() => handleToggleActive(r)} />
          <span>{r.is_active ? 'On' : 'Off'}</span>
        </label>
      ),
      width: '80px',
    },
  ];

  const rowActions = (r: NewsSourceRecord): RowAction[] => [
    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditSource(r) },
    { label: 'Delete', icon: <Trash2 size={14} />, onClick: () => setDeleteTarget(r), destructive: true },
  ];

  const initialValuesForEdit = (r: NewsSourceRecord): NewsSourceFormValues => ({
    name: r.name,
    site_url: r.site_url ?? '',
    feed_url: r.feed_url,
    is_active: r.is_active,
  });

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <p className={styles.intro}>
          Publications scanned daily for new articles. Add a site and the scan stores new posts in the news feed.
        </p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add source
        </Button>
      </div>

      <DataTable<NewsSourceRecord>
        columns={columns}
        data={sources}
        rowKey={(r) => r.id}
        rowActions={rowActions}
        emptyState={<span>No news sources yet. Add a publication to start scanning its feed.</span>}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add news source" size="md">
        <NewsSourceForm onSubmit={handleCreate} submitting={submitting} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={editSource !== null} onClose={() => setEditSource(null)} title="Edit news source" size="md">
        {editSource && (
          <NewsSourceForm
            initialValues={initialValuesForEdit(editSource)}
            onSubmit={handleUpdate}
            submitting={submitting}
            onCancel={() => setEditSource(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove source?"
        description={deleteTarget ? `"${deleteTarget.name}" will no longer be scanned.` : ''}
        confirmLabel="Remove"
        destructive
        loading={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
