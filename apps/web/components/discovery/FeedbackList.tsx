'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FeedbackForm } from './FeedbackForm';
import { FeedbackDetail } from './FeedbackDetail';
import { deleteFeedback } from '@/app/actions/feedback';
import { useToast } from '@/providers/ToastProvider';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { formatRelativeDate } from '@/lib/utils';
import {
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackSource,
  type FeedbackCategory,
} from '@platform/shared';
import { MessageSquare, Eye, Trash2, Plus } from 'lucide-react';
import styles from './FeedbackList.module.css';

export type PainPointOption = { id: string; content: string; interview_id: string };
export type ContactOption   = { id: string; first_name: string; last_name: string };
export type CompanyOption   = { id: string; name: string };

export type FeedbackRow = {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  pain_point_id: string | null;
  source: string;
  date_received: string | null;
  category: string;
  rating: number | null;
  description: string;
  tags: string[];
  sentiment: { score: number; magnitude: number; label: string } | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactOption | null;
  companies: CompanyOption | null;
  pain_points: PainPointOption | null;
};

const CATEGORY_COLORS: Record<string, 'neutral' | 'warning' | 'destructive' | 'success'> = {
  bug_report:      'destructive',
  feature_request: 'warning',
  usability:       'neutral',
  testimonial:     'success',
};

const SENTIMENT_COLORS: Record<string, 'success' | 'neutral' | 'destructive' | 'warning'> = {
  positive: 'success',
  neutral:  'neutral',
  negative: 'destructive',
  mixed:    'warning',
};

interface FeedbackListProps {
  initialEntries: FeedbackRow[];
  contacts: ContactOption[];
  companies: CompanyOption[];
  painPoints: PainPointOption[];
}

export function FeedbackList({ initialEntries, contacts, companies, painPoints }: FeedbackListProps) {
  const [showCreate, setShowCreate]     = useState(false);
  const [viewEntry,  setViewEntry]      = useState<FeedbackRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedbackRow | null>(null);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterCategory,  setFilterCategory]  = useState('');
  const [filterSource,    setFilterSource]    = useState('');
  const [filterPainPoint, setFilterPainPoint] = useState('');

  const router = useRouter();
  const { success, error } = useToast();
  const { items: entries, optimisticAdd } = useOptimisticList(initialEntries);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterCategory  && e.category      !== filterCategory)  return false;
      if (filterSource    && e.source        !== filterSource)    return false;
      if (filterPainPoint && e.pain_point_id !== filterPainPoint) return false;
      return true;
    });
  }, [entries, filterCategory, filterSource, filterPainPoint]);

  const handleCreated = useCallback((entry?: FeedbackRow) => {
    if (entry) optimisticAdd(entry, async () => {});
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteFeedback(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Feedback deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

  const columns: Column<FeedbackRow>[] = [
    {
      key: 'category',
      header: 'Category',
      width: '13%',
      render: (row) => (
        <StatusChip
          label={FEEDBACK_CATEGORY_LABELS[row.category as FeedbackCategory] ?? row.category}
          color={CATEGORY_COLORS[row.category] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'description',
      header: 'Feedback',
      width: '35%',
      render: (row) => <span className={styles.description}>{row.description}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      width: '14%',
      render: (row) => row.contacts
        ? <span className={styles.name}>{row.contacts.first_name} {row.contacts.last_name}</span>
        : <span className={styles.empty}>—</span>,
    },
    {
      key: 'source',
      header: 'Source',
      width: '11%',
      render: (row) => FEEDBACK_SOURCE_LABELS[row.source as FeedbackSource] ?? row.source,
    },
    {
      key: 'rating',
      header: 'Rating',
      width: '8%',
      align: 'center',
      render: (row) => row.rating != null
        ? <span className={styles.rating}>{row.rating}/5</span>
        : <span className={styles.empty}>—</span>,
    },
    {
      key: 'sentiment',
      header: 'Sentiment',
      width: '10%',
      render: (row) => row.sentiment
        ? <StatusChip label={row.sentiment.label} color={SENTIMENT_COLORS[row.sentiment.label] ?? 'neutral'} />
        : <span className={styles.empty}>—</span>,
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '10%',
      sortable: true,
      render: (row) => <span className={styles.date}>{formatRelativeDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select className={styles.filterSelect} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="bug_report">Bug report</option>
            <option value="feature_request">Feature request</option>
            <option value="usability">Usability</option>
            <option value="testimonial">Testimonial</option>
          </select>
          <select className={styles.filterSelect} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="interview">Interview</option>
            <option value="survey">Survey</option>
            <option value="email">Email</option>
            <option value="testimonial">Testimonial</option>
          </select>
          {painPoints.length > 0 && (
            <select className={styles.filterSelect} value={filterPainPoint} onChange={(e) => setFilterPainPoint(e.target.value)}>
              <option value="">All pain points</option>
              {painPoints.map((pp) => (
                <option key={pp.id} value={pp.id}>{pp.content.slice(0, 50)}{pp.content.length > 50 ? '…' : ''}</option>
              ))}
            </select>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add feedback
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => setViewEntry(row)}
        rowActions={(row) => [
          {
            label: 'View',
            icon: <Eye size={14} strokeWidth={1.5} />,
            onClick: () => setViewEntry(row),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(row),
            destructive: true,
          },
        ]}
        pagination={{ page: 1, pageSize: 200, total: filtered.length, onPageChange: () => {} }}
        emptyState={
          <div className={styles.emptyState}>
            <MessageSquare size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No feedback yet</h3>
            <p>Start capturing feedback from MVP tests and discovery interviews.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add feedback</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add feedback"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="feedback-form" loading={isSubmitting}>Save feedback</Button>
          </>
        }
      >
        <FeedbackForm
          contacts={contacts}
          companies={companies}
          painPoints={painPoints}
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Detail */}
      <SlideOver
        open={!!viewEntry}
        onClose={() => setViewEntry(null)}
        title="Feedback details"
      >
        {viewEntry && (
          <FeedbackDetail
            entry={viewEntry}
            onDelete={() => { setDeleteTarget(viewEntry); setViewEntry(null); }}
          />
        )}
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete feedback"
        description="Permanently remove this feedback entry? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
