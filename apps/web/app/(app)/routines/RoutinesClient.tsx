'use client';

import { useState } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { AgentBadge } from '@/components/ui/AgentBadge';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RoutineForm, type RoutineFormValues } from './RoutineForm';
import {
  deleteRoutine,
  toggleRoutineActive,
  runRoutineNow,
  createRoutine,
  updateRoutine,
} from '@/app/actions/routines';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate, formatTimeInTz } from '@/lib/utils';
import { useToast } from '@/providers/ToastProvider';
import { Plus, Play, Pencil, Trash2 } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionsMenu';
import type { RoutineFrequency, RoutineActionType } from '@platform/shared';
import styles from './routines.module.css';

type RoutineRow = {
  id: string;
  name: string;
  description: string | null;
  agent_name: string;
  action_type: string;
  action_config: unknown;
  frequency: string;
  time_of_day: string;
  timezone: string;
  next_run_at: string;
  last_run_at: string | null;
  last_result: unknown;
  last_status: string | null;
  show_on_dashboard: boolean;
  dashboard_title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

interface RoutinesClientProps {
  initialRoutines: RoutineRow[];
}

function formatFrequencyLabel(row: RoutineRow): string {
  const freq = row.frequency.charAt(0).toUpperCase() + row.frequency.slice(1);
  const [hh, mm] = row.time_of_day.split(':');
  return `${freq} at ${hh}:${mm}`;
}

function formatActionLabel(actionType: string): string {
  if (actionType === 'research_digest') return 'Research digest';
  if (actionType === 'monitor_change') return 'Monitor change';
  if (actionType === 'news_ingest') return 'News ingest';
  return actionType;
}

function statusColor(status: string | null): 'neutral' | 'success' | 'destructive' | 'warning' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'destructive';
  if (status === 'running') return 'warning';
  return 'neutral';
}

export function RoutinesClient({ initialRoutines }: RoutinesClientProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editRoutine, setEditRoutine] = useState<RoutineRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutineRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { success, error } = useToast();
  const { items: routines, optimisticUpdate, optimisticRemove } = useOptimisticList(initialRoutines);

  const handleCreate = async (values: RoutineFormValues) => {
    setSubmitting(true);
    const fd = valuesToFormData(values);
    const result = await createRoutine(fd);
    setSubmitting(false);
    if (result.error) {
      error(result.error);
      return;
    }
    success('Routine created');
    setShowCreate(false);
  };

  const handleUpdate = async (values: RoutineFormValues) => {
    if (!editRoutine) return;
    setSubmitting(true);
    const fd = valuesToFormData(values);
    const result = await updateRoutine(editRoutine.id, fd);
    setSubmitting(false);
    if (result.error) {
      error(result.error);
      return;
    }
    success('Routine updated');
    setEditRoutine(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const id = deleteTarget.id;
    const result = await deleteRoutine(id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
      return;
    }
    success('Routine deleted');
    optimisticRemove(id, async () => {});
    setDeleteTarget(null);
  };

  const handleToggleActive = async (row: RoutineRow) => {
    const next = !row.is_active;
    optimisticUpdate(row.id, { is_active: next }, async () => {
      const result = await toggleRoutineActive(row.id, next);
      if (result.error) error(result.error);
    });
  };

  const handleRunNow = async (row: RoutineRow) => {
    const result = await runRoutineNow(row.id);
    if (result.error) error(result.error);
    else success('Queued for the next check');
  };

  const columns: Column<RoutineRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div className={styles.nameCell}>
          <span className={styles.nameText}>{r.name}</span>
          {r.description && <span className={styles.nameSub}>{r.description}</span>}
        </div>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (r) => <AgentBadge agentName={r.agent_name} size="sm" />,
      width: '140px',
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => <span>{formatActionLabel(r.action_type)}</span>,
      width: '150px',
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (r) => <span>{formatFrequencyLabel(r)}</span>,
      width: '160px',
    },
    {
      key: 'next',
      header: 'Next run',
      render: (r) =>
        r.is_active ? (
          <div className={styles.nameCell}>
            <span>{formatRelativeDate(r.next_run_at, r.timezone)}</span>
            <span className={styles.nameSub}>{formatTimeInTz(r.next_run_at, r.timezone)}</span>
          </div>
        ) : (
          <span className={styles.muted}>—</span>
        ),
      width: '160px',
    },
    {
      key: 'last',
      header: 'Last run',
      render: (r) =>
        r.last_run_at ? (
          <div className={styles.lastCell}>
            <div className={styles.nameCell}>
              <span className={styles.muted}>{formatRelativeDate(r.last_run_at, r.timezone)}</span>
              <span className={styles.nameSub}>{formatTimeInTz(r.last_run_at, r.timezone)}</span>
            </div>
            {r.last_status && (
              <StatusChip label={r.last_status} color={statusColor(r.last_status)} />
            )}
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
          <input
            type="checkbox"
            checked={r.is_active}
            onChange={() => handleToggleActive(r)}
          />
          <span>{r.is_active ? 'On' : 'Off'}</span>
        </label>
      ),
      width: '80px',
    },
  ];

  const rowActions = (r: RoutineRow): RowAction[] => [
    { label: 'Run now', icon: <Play size={14} />, onClick: () => handleRunNow(r) },
    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditRoutine(r) },
    {
      label: 'Delete',
      icon: <Trash2 size={14} />,
      onClick: () => setDeleteTarget(r),
      destructive: true,
    },
  ];

  const initialValuesForEdit = (r: RoutineRow): RoutineFormValues => ({
    name: r.name,
    description: r.description ?? '',
    agent_name: r.agent_name,
    action_type: r.action_type as RoutineActionType,
    action_config: (r.action_config as Record<string, unknown>) ?? {},
    frequency: r.frequency as RoutineFrequency,
    time_of_day: r.time_of_day.slice(0, 5),
    timezone: r.timezone,
    show_on_dashboard: r.show_on_dashboard,
    dashboard_title: r.dashboard_title ?? '',
    is_active: r.is_active,
  });

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New routine
        </Button>
      </div>

      <DataTable<RoutineRow>
        columns={columns}
        data={routines}
        rowKey={(r) => r.id}
        rowActions={rowActions}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New routine" size="md">
        <RoutineForm onSubmit={handleCreate} submitting={submitting} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal
        open={editRoutine !== null}
        onClose={() => setEditRoutine(null)}
        title="Edit routine"
        size="md"
      >
        {editRoutine && (
          <RoutineForm
            initialValues={initialValuesForEdit(editRoutine)}
            onSubmit={handleUpdate}
            submitting={submitting}
            onCancel={() => setEditRoutine(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete routine?"
        description={deleteTarget ? `"${deleteTarget.name}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        destructive
        loading={isDeleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function valuesToFormData(v: RoutineFormValues): FormData {
  const fd = new FormData();
  fd.set('name', v.name);
  fd.set('description', v.description ?? '');
  fd.set('agent_name', v.agent_name);
  fd.set('action_type', v.action_type);
  fd.set('frequency', v.frequency);
  fd.set('time_of_day', v.time_of_day);
  fd.set('timezone', v.timezone);
  fd.set('show_on_dashboard', v.show_on_dashboard ? 'true' : 'false');
  fd.set('dashboard_title', v.dashboard_title ?? '');
  fd.set('is_active', v.is_active ? 'true' : 'false');

  const cfg = v.action_config as Record<string, unknown>;
  if (v.action_type === 'research_digest') {
    fd.set('subject', String(cfg['subject'] ?? ''));
    fd.set('context', String(cfg['context'] ?? ''));
    fd.set('search_queries', Array.isArray(cfg['search_queries']) ? (cfg['search_queries'] as string[]).join('\n') : '');
    fd.set('archive_sources', cfg['archive_sources'] ? 'true' : 'false');
    fd.set('max_sources', String(cfg['max_sources'] ?? 10));
  } else if (v.action_type === 'monitor_change') {
    fd.set('subject', String(cfg['subject'] ?? ''));
    fd.set('context', String(cfg['context'] ?? ''));
    fd.set('search_queries', Array.isArray(cfg['search_queries']) ? (cfg['search_queries'] as string[]).join('\n') : '');
    fd.set('notify_signal', cfg['notify_signal'] ? 'true' : 'false');
    if (cfg['notify_agent']) fd.set('notify_agent', String(cfg['notify_agent']));
  } else if (v.action_type === 'news_ingest') {
    fd.set('category', String(cfg['category'] ?? ''));
    fd.set('queries', JSON.stringify(Array.isArray(cfg['queries']) ? cfg['queries'] : []));
    fd.set('max_results_per_query', String(cfg['max_results_per_query'] ?? 15));
    fd.set('max_curated', String(cfg['max_curated'] ?? 6));
  }
  return fd;
}
