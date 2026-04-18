'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InterviewForm } from './InterviewForm';
import { InterviewDetail } from './InterviewDetail';
import { deleteInterview } from '@/app/actions/interviews';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate } from '@/lib/utils';
import {
  STAKEHOLDER_ROLE_LABELS,
  TRIGGER_EVENT_LABELS,
  INTERVIEW_STATUS_LABELS,
  type StakeholderRole,
  type TriggerEventType,
  type InterviewStatus,
} from '@platform/shared';
import { CalendarSearch, Eye, Pencil, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import styles from './InterviewsList.module.css';

type ContactJoin = { id: string; first_name: string; last_name: string; job_title: string | null; role: string | null } | null;
type CompanyJoin = { id: string; name: string } | null;

export type InterviewRow = {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  interview_date: string | null;
  status: string;
  channel: string | null;
  notes: string | null;
  pain_points: string[];
  trigger_event: string | null;
  email_thread_id: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactJoin;
  companies: CompanyJoin;
};

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'neutral' | 'destructive'> = {
  scheduled: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show:   'destructive',
};

interface InterviewsListProps {
  initialInterviews: InterviewRow[];
  companies: { id: string; name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
}

export function InterviewsList({ initialInterviews, companies, contacts }: InterviewsListProps) {
  const [showCreate, setShowCreate]       = useState(false);
  const [editInterview, setEditInterview] = useState<InterviewRow | null>(null);
  const [viewInterview, setViewInterview] = useState<InterviewRow | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<InterviewRow | null>(null);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [isSubmitting, setIsSubmitting]   = useState(false);

  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterRole,    setFilterRole]    = useState('');
  const [filterTrigger, setFilterTrigger] = useState('');

  const router  = useRouter();
  const { success, error } = useToast();
  const { items: interviews, optimisticAdd } = useOptimisticList(initialInterviews);

  const filtered = useMemo(() => {
    return interviews.filter((row) => {
      if (filterStatus  && row.status        !== filterStatus)  return false;
      if (filterRole    && row.contacts?.role !== filterRole)    return false;
      if (filterTrigger && row.trigger_event  !== filterTrigger) return false;
      return true;
    });
  }, [interviews, filterStatus, filterRole, filterTrigger]);

  const handleCreated = useCallback((interview?: InterviewRow) => {
    if (interview) optimisticAdd(interview, async () => {});
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteInterview(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Interview deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

  const columns: Column<InterviewRow>[] = [
    {
      key: 'contact',
      header: 'Contact',
      width: '18%',
      render: (row) => (
        <span className={styles.name}>
          {row.contacts ? `${row.contacts.first_name} ${row.contacts.last_name}` : '—'}
        </span>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      width: '15%',
      render: (row) => row.companies?.name || '—',
    },
    {
      key: 'role',
      header: 'Role',
      width: '10%',
      render: (row) => {
        const role = row.contacts?.role as StakeholderRole | null;
        return role
          ? <StatusChip label={STAKEHOLDER_ROLE_LABELS[role] ?? role} color="neutral" />
          : <span className={styles.unassigned}>—</span>;
      },
    },
    {
      key: 'date',
      header: 'Date',
      width: '13%',
      sortable: true,
      render: (row) => row.interview_date
        ? <span className={styles.mono}>{formatRelativeDate(row.interview_date)}</span>
        : <span className={styles.unassigned}>—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '11%',
      render: (row) => (
        <StatusChip
          label={INTERVIEW_STATUS_LABELS[row.status as InterviewStatus] ?? row.status}
          color={STATUS_COLORS[row.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'trigger',
      header: 'Why now',
      width: '16%',
      render: (row) => row.trigger_event
        ? TRIGGER_EVENT_LABELS[row.trigger_event as TriggerEventType] ?? row.trigger_event
        : '—',
    },
    {
      key: 'pain_points',
      header: 'Pain points',
      width: '10%',
      align: 'right',
      render: (row) => {
        const n = row.pain_points?.length ?? 0;
        return n > 0
          ? <StatusChip label={`${n} point${n === 1 ? '' : 's'}`} color="neutral" />
          : <span className={styles.unassigned}>—</span>;
      },
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No show</option>
          </select>
          <select
            className={styles.filterSelect}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">All roles</option>
            <option value="CFO">CFO</option>
            <option value="CEO">CEO</option>
            <option value="HR">HR</option>
            <option value="Treasury">Treasury</option>
            <option value="PeopleOps">People Ops</option>
            <option value="Other">Other</option>
          </select>
          <select
            className={styles.filterSelect}
            value={filterTrigger}
            onChange={(e) => setFilterTrigger(e.target.value)}
          >
            <option value="">All triggers</option>
            <option value="FASB_CHANGE">FASB change</option>
            <option value="EMPLOYEE_BTC_REQUEST">Employee BTC request</option>
            <option value="REGULATORY_UPDATE">Regulatory update</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Schedule interview
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => setViewInterview(row)}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => setViewInterview(row),
          },
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditInterview(row),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(row),
            destructive: true,
          },
        ]}
        pagination={{
          page: 1,
          pageSize: 100,
          total: filtered.length,
          onPageChange: () => {},
        }}
        emptyState={
          <div className={styles.empty}>
            <CalendarSearch size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No interviews yet</h3>
            <p>Schedule your first discovery interview to start capturing insights.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Schedule interview</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Schedule interview"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="interview-form" loading={isSubmitting}>Save interview</Button>
          </>
        }
      >
        <InterviewForm
          contacts={contacts}
          companies={companies}
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit */}
      <SlideOver
        open={!!editInterview}
        onClose={() => setEditInterview(null)}
        title="Edit interview"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditInterview(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="interview-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editInterview && (
          <InterviewForm
            key={editInterview.id}
            contacts={contacts}
            companies={companies}
            mode="edit"
            defaultValues={editInterview}
            onSuccess={() => {
              setEditInterview(null);
              router.refresh();
            }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>

      {/* Detail view */}
      <SlideOver
        open={!!viewInterview}
        onClose={() => setViewInterview(null)}
        title="Interview details"
      >
        {viewInterview && (
          <InterviewDetail
            interview={viewInterview}
            onEdit={() => {
              setEditInterview(viewInterview);
              setViewInterview(null);
            }}
          />
        )}
      </SlideOver>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete interview"
        description="Permanently delete this interview record and its pain point log? This cannot be undone."
        confirmLabel="Delete interview"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
