'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CommunityForm } from './CommunityForm';
import { deleteCommunityEntry, updateCommunityEntry } from '@/app/actions/community';
import { useToast } from '@/providers/ToastProvider';
import { formatRelativeDate } from '@/lib/utils';
import {
  COMMUNITY_TYPE_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  type CommunityType,
  type EngagementStatus,
} from '@platform/shared';
import { Globe, Plus, Eye, Pencil, Trash2, ExternalLink } from 'lucide-react';
import styles from './CommunityWatchlist.module.css';

export type CommunityRow = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  description: string | null;
  role_tags: string[];
  industry_tags: string[];
  membership_size: number | null;
  activity_level: number | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  engagement_status: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_COLORS: Record<string, 'neutral' | 'warning' | 'success'> = {
  linkedin_group: 'neutral',
  association:    'warning',
  conference:     'success',
};

const ENGAGEMENT_COLORS: Record<string, 'neutral' | 'warning' | 'success' | 'accent'> = {
  not_joined: 'neutral',
  joined:     'warning',
  attended:   'success',
  sponsor:    'accent',
};

interface CommunityWatchlistProps {
  initialEntries: CommunityRow[];
}

export function CommunityWatchlist({ initialEntries }: CommunityWatchlistProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [showCreate,    setShowCreate]    = useState(false);
  const [editEntry,     setEditEntry]     = useState<CommunityRow | null>(null);
  const [viewEntry,     setViewEntry]     = useState<CommunityRow | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<CommunityRow | null>(null);
  const [isDeleting,    setIsDeleting]    = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);

  const [filterType,       setFilterType]       = useState('');
  const [filterEngagement, setFilterEngagement] = useState('');

  const router = useRouter();
  const { success, error } = useToast();

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterType       && e.type              !== filterType)       return false;
      if (filterEngagement && e.engagement_status !== filterEngagement) return false;
      return true;
    });
  }, [entries, filterType, filterEngagement]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    router.refresh();
  }, [router]);

  const handleUpdated = useCallback(() => {
    setEditEntry(null);
    router.refresh();
  }, [router]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteCommunityEntry(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Entry removed');
      setDeleteTarget(null);
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      router.refresh();
    }
  };

  const handleEngagementChange = async (entry: CommunityRow, status: string) => {
    const fd = new FormData();
    fd.set('engagement_status', status);
    const result = await updateCommunityEntry(entry.id, fd);
    if (result.error) {
      error(result.error);
    } else {
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, engagement_status: status } : e));
      router.refresh();
    }
  };

  const columns: Column<CommunityRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '24%',
      render: (row) => (
        <span className={styles.name}>{row.name}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '13%',
      render: (row) => (
        <StatusChip
          label={COMMUNITY_TYPE_LABELS[row.type as CommunityType] ?? row.type}
          color={TYPE_COLORS[row.type] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'role_tags',
      header: 'Roles',
      width: '16%',
      render: (row) => row.role_tags.length > 0 ? (
        <div className={styles.tags}>
          {row.role_tags.slice(0, 3).map((t) => <span key={t} className={styles.tag}>{t}</span>)}
          {row.role_tags.length > 3 && <span className={styles.tag}>+{row.role_tags.length - 3}</span>}
        </div>
      ) : <span className={styles.empty}>—</span>,
    },
    {
      key: 'activity_level',
      header: 'Activity',
      width: '10%',
      align: 'center',
      render: (row) => row.activity_level != null ? (
        <div className={styles.score}>
          {[1,2,3,4,5].map((n) => (
            <div key={n} className={`${styles.scoreDot} ${n <= row.activity_level! ? styles.scoreDotFilled : ''}`} />
          ))}
        </div>
      ) : <span className={styles.empty}>—</span>,
    },
    {
      key: 'engagement_status',
      header: 'Our status',
      width: '13%',
      render: (row) => (
        <select
          className={styles.filterSelect}
          value={row.engagement_status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleEngagementChange(row, e.target.value)}
          style={{ height: 28, fontSize: 12 }}
        >
          <option value="not_joined">Not joined</option>
          <option value="joined">Joined</option>
          <option value="attended">Attended</option>
          <option value="sponsor">Sponsor</option>
        </select>
      ),
    },
    {
      key: 'start_date',
      header: 'Date',
      width: '12%',
      sortable: true,
      render: (row) => row.start_date
        ? <span className={styles.date}>{row.start_date}</span>
        : <span className={styles.empty}>—</span>,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="linkedin_group">LinkedIn Group</option>
            <option value="association">Association</option>
            <option value="conference">Conference</option>
          </select>
          <select className={styles.filterSelect} value={filterEngagement} onChange={(e) => setFilterEngagement(e.target.value)}>
            <option value="">All statuses</option>
            <option value="not_joined">Not joined</option>
            <option value="joined">Joined</option>
            <option value="attended">Attended</option>
            <option value="sponsor">Sponsor</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add community
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => setViewEntry(row)}
        rowActions={(row) => [
          { label: 'View', icon: <Eye size={14} strokeWidth={1.5} />, onClick: () => setViewEntry(row) },
          { label: 'Edit', icon: <Pencil size={14} strokeWidth={1.5} />, onClick: () => setEditEntry(row) },
          { label: 'Remove', icon: <Trash2 size={14} strokeWidth={1.5} />, onClick: () => setDeleteTarget(row), destructive: true },
        ]}
        pagination={{ page: 1, pageSize: 200, total: filtered.length, onPageChange: () => {} }}
        emptyState={
          <div className={styles.emptyState}>
            <Globe size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No communities tracked yet</h3>
            <p>Add LinkedIn groups, associations, and conferences where your decision-makers gather.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add community</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add community"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="community-form" loading={isSubmitting}>Save</Button>
          </>
        }
      >
        <CommunityForm onSuccess={handleCreated} onPendingChange={setIsSubmitting} />
      </SlideOver>

      {/* Edit */}
      <SlideOver
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        title="Edit community"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="community-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editEntry && (
          <CommunityForm entry={editEntry} onSuccess={handleUpdated} onPendingChange={setIsSubmitting} />
        )}
      </SlideOver>

      {/* Detail */}
      <SlideOver
        open={!!viewEntry}
        onClose={() => setViewEntry(null)}
        title={viewEntry?.name ?? 'Community details'}
        footer={
          viewEntry ? (
            <>
              <Button variant="secondary" onClick={() => { setEditEntry(viewEntry); setViewEntry(null); }}>
                <Pencil size={14} strokeWidth={1.5} /> Edit
              </Button>
              {viewEntry.url && (
                <Button variant="primary" onClick={() => window.open(viewEntry.url!, '_blank')}>
                  <ExternalLink size={14} strokeWidth={1.5} /> Open link
                </Button>
              )}
            </>
          ) : null
        }
      >
        {viewEntry && (
          <div className={styles.detail}>
            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Type</span>
                <span className={styles.detailValue}>
                  {COMMUNITY_TYPE_LABELS[viewEntry.type as CommunityType] ?? viewEntry.type}
                </span>
              </div>
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Our status</span>
                <StatusChip
                  label={ENGAGEMENT_STATUS_LABELS[viewEntry.engagement_status as EngagementStatus] ?? viewEntry.engagement_status}
                  color={ENGAGEMENT_COLORS[viewEntry.engagement_status] ?? 'neutral'}
                />
              </div>
              {viewEntry.membership_size != null && (
                <div className={styles.detailSection}>
                  <span className={styles.detailLabel}>Members / attendees</span>
                  <span className={styles.detailValue}>{viewEntry.membership_size.toLocaleString()}</span>
                </div>
              )}
              {viewEntry.activity_level != null && (
                <div className={styles.detailSection}>
                  <span className={styles.detailLabel}>Activity level</span>
                  <span className={styles.detailValue}>{viewEntry.activity_level} / 5</span>
                </div>
              )}
              {viewEntry.location && (
                <div className={styles.detailSection}>
                  <span className={styles.detailLabel}>Location</span>
                  <span className={styles.detailValue}>{viewEntry.location}</span>
                </div>
              )}
              {(viewEntry.start_date || viewEntry.end_date) && (
                <div className={styles.detailSection}>
                  <span className={styles.detailLabel}>Dates</span>
                  <span className={styles.detailValue}>
                    {viewEntry.start_date ?? '?'}{viewEntry.end_date ? ` → ${viewEntry.end_date}` : ''}
                  </span>
                </div>
              )}
            </div>
            {viewEntry.description && (
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Description</span>
                <p className={styles.noteText}>{viewEntry.description}</p>
              </div>
            )}
            {viewEntry.role_tags.length > 0 && (
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Target roles</span>
                <div className={styles.tags}>
                  {viewEntry.role_tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              </div>
            )}
            {viewEntry.industry_tags.length > 0 && (
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Industries</span>
                <div className={styles.tags}>
                  {viewEntry.industry_tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              </div>
            )}
            {viewEntry.notes && (
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>Notes</span>
                <p className={styles.noteText}>{viewEntry.notes}</p>
              </div>
            )}
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>Added</span>
              <span className={styles.detailValue}>{formatRelativeDate(viewEntry.created_at)}</span>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove community"
        description={`Remove "${deleteTarget?.name}" from the watchlist?`}
        confirmLabel="Remove"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
