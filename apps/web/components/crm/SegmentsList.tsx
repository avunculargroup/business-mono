'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SegmentForm } from './SegmentForm';
import { deleteSegment, updateSegment } from '@/app/actions/segments';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { LayoutGrid, Pencil, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import type { SegmentScorecard } from '@platform/shared';
import styles from './SegmentsList.module.css';

interface SegmentsListProps {
  initialSegments: SegmentScorecard[];
}

function ScoreCell({
  segmentId,
  field,
  value,
  onSaved,
}: {
  segmentId: string;
  field: 'need_score' | 'access_score';
  value: number | null;
  onSaved: (id: string, field: string, val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const { error } = useToast();

  const save = async () => {
    const num = parseInt(inputVal, 10);
    if (!isNaN(num) && num >= 1 && num <= 5) {
      const fd = new FormData();
      fd.set(field, String(num));
      const result = await updateSegment(segmentId, fd);
      if (result.error) {
        error(result.error);
      } else {
        onSaved(segmentId, field, num);
      }
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={5}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className={styles.scoreInput}
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.scoreBtn}
      onClick={() => {
        setInputVal(String(value ?? ''));
        setEditing(true);
      }}
      title="Click to edit"
    >
      {value ?? <span className={styles.unassigned}>—</span>}
    </button>
  );
}

export function SegmentsList({ initialSegments }: SegmentsListProps) {
  const [showCreate, setShowCreate]     = useState(false);
  const [editSegment, setEditSegment]   = useState<SegmentScorecard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SegmentScorecard | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router  = useRouter();
  const { success, error } = useToast();
  const { items: segments, optimisticAdd, optimisticUpdate } = useOptimisticList(initialSegments);

  const handleCreated = useCallback((segment?: SegmentScorecard) => {
    if (segment) optimisticAdd(segment, async () => {});
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleScoreSaved = useCallback((id: string, field: string, val: number) => {
    optimisticUpdate(id, { [field]: val } as Partial<SegmentScorecard>, async () => {});
  }, [optimisticUpdate]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteSegment(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Segment deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

  // Find the max weighted score for highlighting
  const maxWeighted = Math.max(
    0,
    ...segments
      .map((s) => s.need_score != null && s.access_score != null ? s.need_score * s.access_score : 0)
      .filter((v) => v > 0),
  );

  const columns: Column<SegmentScorecard>[] = [
    {
      key: 'segment_name',
      header: 'Segment',
      width: '22%',
      render: (row) => <span className={styles.segmentName}>{row.segment_name}</span>,
    },
    {
      key: 'need_score',
      header: 'Need',
      width: '9%',
      align: 'right',
      render: (row) => (
        <ScoreCell
          segmentId={row.id}
          field="need_score"
          value={row.need_score}
          onSaved={handleScoreSaved}
        />
      ),
    },
    {
      key: 'access_score',
      header: 'Access',
      width: '9%',
      align: 'right',
      render: (row) => (
        <ScoreCell
          segmentId={row.id}
          field="access_score"
          value={row.access_score}
          onSaved={handleScoreSaved}
        />
      ),
    },
    {
      key: 'weighted',
      header: 'Weighted',
      width: '10%',
      align: 'right',
      render: (row) => {
        if (row.need_score == null || row.access_score == null) {
          return <span className={styles.unassigned}>—</span>;
        }
        const w = row.need_score * row.access_score;
        return (
          <span className={`${styles.mono} ${w === maxWeighted && w > 0 ? styles.topScore : ''}`}>
            {w}
          </span>
        );
      },
    },
    {
      key: 'planned_interviews',
      header: 'Planned',
      width: '10%',
      align: 'right',
      render: (row) => <span className={styles.mono}>{row.planned_interviews}</span>,
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '30%',
      render: (row) => (
        <span className={styles.notes}>{row.notes || <span className={styles.unassigned}>—</span>}</span>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New segment
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={segments}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'Edit',
            icon: <Pencil size={14} strokeWidth={1.5} />,
            onClick: () => setEditSegment(row),
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} strokeWidth={1.5} />,
            onClick: () => setDeleteTarget(row),
            destructive: true,
          },
        ]}
        pagination={{ page: 1, pageSize: 100, total: segments.length, onPageChange: () => {} }}
        emptyState={
          <div className={styles.empty}>
            <LayoutGrid size={48} strokeWidth={1} className={styles.emptyIcon} />
            <h3>No segments yet</h3>
            <p>Add your first market segment to start tracking opportunities.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add segment</Button>
          </div>
        }
      />

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New segment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="segment-form" loading={isSubmitting}>Save segment</Button>
          </>
        }
      >
        <SegmentForm
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit */}
      <SlideOver
        open={!!editSegment}
        onClose={() => setEditSegment(null)}
        title="Edit segment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditSegment(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="segment-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editSegment && (
          <SegmentForm
            key={editSegment.id}
            mode="edit"
            defaultValues={editSegment}
            onSuccess={() => {
              setEditSegment(null);
              router.refresh();
            }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete segment"
        description={`Permanently delete "${deleteTarget?.segment_name}"? This cannot be undone.`}
        confirmLabel="Delete segment"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
