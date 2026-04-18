'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChampionForm } from './ChampionForm';
import { deleteChampion } from '@/app/actions/champions';
import { useToast } from '@/providers/ToastProvider';
import { formatRelativeDate } from '@/lib/utils';
import {
  CHAMPION_STATUS_LABELS,
  CHAMPION_ROLE_TYPE_LABELS,
  type ChampionStatus,
  type ChampionRoleType,
} from '@platform/shared';
import { Shield, Plus, Eye, Trash2 } from 'lucide-react';
import styles from './Champions.module.css';

type ContactJoin  = { id: string; first_name: string; last_name: string; job_title: string | null; pipeline_stage: string | null } | null;
type CompanyJoin  = { id: string; name: string } | null;

export type ChampionRow = {
  id: string;
  contact_id: string;
  company_id: string | null;
  role_type: string;
  champion_score: number;
  status: string;
  last_contacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactJoin;
  companies: CompanyJoin;
};

export type ContactOption = { id: string; first_name: string; last_name: string; company_id?: string | null };
export type CompanyOption = { id: string; name: string };

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'destructive'> = {
  active:   'success',
  at_risk:  'warning',
  departed: 'destructive',
};

interface ChampionsListProps {
  initialChampions: ChampionRow[];
  contacts: ContactOption[];
  companies: CompanyOption[];
}

export function ChampionsList({ initialChampions, contacts, companies }: ChampionsListProps) {
  const [champions, setChampions] = useState(initialChampions);
  const [showCreate,   setShowCreate]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChampionRow | null>(null);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterRoleType, setFilterRoleType] = useState('');

  const router = useRouter();
  const { success, error } = useToast();

  const filtered = useMemo(() => {
    return champions.filter((c) => {
      if (filterStatus   && c.status    !== filterStatus)   return false;
      if (filterRoleType && c.role_type !== filterRoleType) return false;
      return true;
    });
  }, [champions, filterStatus, filterRoleType]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    router.refresh();
  }, [router]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteChampion(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Champion designation removed');
      setDeleteTarget(null);
      setChampions((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      router.refresh();
    }
  };

  const columns: Column<ChampionRow>[] = [
    {
      key: 'contact',
      header: 'Contact',
      width: '22%',
      render: (row) => (
        <div>
          <div className={styles.name}>
            {row.contacts ? `${row.contacts.first_name} ${row.contacts.last_name}` : '—'}
          </div>
          {row.contacts?.job_title && (
            <div className={styles.sub}>{row.contacts.job_title}</div>
          )}
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      width: '18%',
      render: (row) => row.companies?.name ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'role_type',
      header: 'Role',
      width: '16%',
      render: (row) => (
        <StatusChip
          label={CHAMPION_ROLE_TYPE_LABELS[row.role_type as ChampionRoleType] ?? row.role_type}
          color="neutral"
        />
      ),
    },
    {
      key: 'champion_score',
      header: 'Score',
      width: '10%',
      align: 'center',
      render: (row) => (
        <div className={styles.score}>
          {[1,2,3,4,5].map((n) => (
            <div key={n} className={`${styles.scoreDot} ${n <= row.champion_score ? styles.scoreDotFilled : ''}`} />
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (row) => (
        <StatusChip
          label={CHAMPION_STATUS_LABELS[row.status as ChampionStatus] ?? row.status}
          color={STATUS_COLORS[row.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'last_contacted_at',
      header: 'Last contact',
      width: '14%',
      sortable: true,
      render: (row) => row.last_contacted_at
        ? <span className={styles.empty}>{formatRelativeDate(row.last_contacted_at)}</span>
        : <span className={styles.empty}>—</span>,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="at_risk">At risk</option>
            <option value="departed">Departed</option>
          </select>
          <select className={styles.filterSelect} value={filterRoleType} onChange={(e) => setFilterRoleType(e.target.value)}>
            <option value="">All roles</option>
            <option value="Champion">Champion</option>
            <option value="Economic Buyer">Economic Buyer</option>
            <option value="Influencer">Influencer</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add champion
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/crm/champions/${row.id}`)}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => router.push(`/crm/champions/${row.id}`),
          },
          {
            label: 'Remove designation',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(row),
            destructive: true,
          },
        ]}
        pagination={{ page: 1, pageSize: 200, total: filtered.length, onPageChange: () => {} }}
        emptyState={
          <div className={styles.emptyState}>
            <Shield size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No champions tracked yet</h3>
            <p>Designate internal advocates at target accounts to protect deals and track job changes.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add champion</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add champion"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="champion-form" loading={isSubmitting}>Save</Button>
          </>
        }
      >
        <ChampionForm contacts={contacts} companies={companies} onSuccess={handleCreated} onPendingChange={setIsSubmitting} />
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove champion designation"
        description={`Remove champion designation for ${deleteTarget?.contacts ? `${deleteTarget.contacts.first_name} ${deleteTarget.contacts.last_name}` : 'this contact'}? The contact record will not be deleted.`}
        confirmLabel="Remove"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
