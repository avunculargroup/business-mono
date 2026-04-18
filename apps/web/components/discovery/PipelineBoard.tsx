'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { PipelineItemForm } from './PipelineItemForm';
import { movePipelineItem } from '@/app/actions/pipeline';
import { useToast } from '@/providers/ToastProvider';
import { INSIGHT_PIPELINE_STAGE_LABELS } from '@platform/shared';
import { Plus, GripVertical, ChevronRight, ChevronLeft } from 'lucide-react';
import styles from './PipelineBoard.module.css';

export type PipelineItemRow = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  status: string;
  topic_tags: string[] | null;
  scheduled_for: string | null;
  assigned_to: string | null;
  pain_point_id: string | null;
  score: number | null;
  research_links: Array<{ url: string; title: string; note?: string }> | null;
  created_at: string;
  updated_at: string;
};

export type PainPointOption = { id: string; content: string; interview_id: string };
export type TeamMember      = { id: string; full_name: string };

// Stage order for the Kanban board — maps content_items.status to column label
const STAGES = [
  { status: 'idea',      label: INSIGHT_PIPELINE_STAGE_LABELS['idea']      },
  { status: 'draft',     label: INSIGHT_PIPELINE_STAGE_LABELS['draft']     },
  { status: 'review',    label: INSIGHT_PIPELINE_STAGE_LABELS['review']    },
  { status: 'approved',  label: INSIGHT_PIPELINE_STAGE_LABELS['approved']  },
  { status: 'published', label: INSIGHT_PIPELINE_STAGE_LABELS['published'] },
] as const;

interface PipelineBoardProps {
  initialItems: PipelineItemRow[];
  painPoints: PainPointOption[];
  teamMembers: TeamMember[];
}

export function PipelineBoard({ initialItems, painPoints, teamMembers }: PipelineBoardProps) {
  const [items, setItems]           = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState<PipelineItemRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [movingId, setMovingId]     = useState<string | null>(null);

  const router = useRouter();
  const { success, error } = useToast();

  const itemsByStage = useMemo(() => {
    const map: Record<string, PipelineItemRow[]> = {};
    for (const stage of STAGES) map[stage.status] = [];
    for (const item of items) {
      if (map[item.status]) map[item.status].push(item);
    }
    return map;
  }, [items]);

  const handleMove = useCallback(async (item: PipelineItemRow, direction: 'forward' | 'back') => {
    const idx = STAGES.findIndex((s) => s.status === item.status);
    const nextIdx = direction === 'forward' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= STAGES.length) return;

    const newStatus = STAGES[nextIdx].status;
    setMovingId(item.id);

    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: newStatus } : i));

    const result = await movePipelineItem(item.id, newStatus);
    setMovingId(null);

    if (result.error) {
      error(result.error);
      // Revert
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: item.status } : i));
    } else {
      success(`Moved to ${INSIGHT_PIPELINE_STAGE_LABELS[newStatus] ?? newStatus}`);
    }
  }, [error, success]);

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    router.refresh();
  }, [router]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          New idea
        </Button>
      </div>

      <div className={styles.board}>
        {STAGES.map((stage) => {
          const stageItems = itemsByStage[stage.status] ?? [];
          return (
            <div key={stage.status} className={styles.column}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{stage.label}</span>
                <span className={styles.columnCount}>{stageItems.length}</span>
              </div>

              <div className={styles.cards}>
                {stageItems.map((item) => {
                  const stageIdx = STAGES.findIndex((s) => s.status === item.status);
                  const painPoint = painPoints.find((pp) => pp.id === item.pain_point_id);
                  return (
                    <div
                      key={item.id}
                      className={`${styles.card} ${movingId === item.id ? styles.moving : ''}`}
                      onClick={() => setEditItem(item)}
                    >
                      <div className={styles.cardDrag}>
                        <GripVertical size={14} strokeWidth={1.5} className={styles.dragIcon} />
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{item.title}</p>
                        {painPoint && (
                          <p className={styles.cardPainPoint}>{painPoint.content.slice(0, 60)}{painPoint.content.length > 60 ? '…' : ''}</p>
                        )}
                        <div className={styles.cardMeta}>
                          {item.score != null && (
                            <span className={styles.score}>Score: {item.score}</span>
                          )}
                          {item.scheduled_for && (
                            <span className={styles.dueDate}>
                              Due {new Date(item.scheduled_for).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {item.topic_tags && item.topic_tags.length > 0 && (
                            <div className={styles.tags}>
                              {item.topic_tags.slice(0, 2).map((tag) => (
                                <span key={tag} className={styles.tag}>{tag}</span>
                              ))}
                              {item.topic_tags.length > 2 && (
                                <span className={styles.tag}>+{item.topic_tags.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.cardNav} onClick={(e) => e.stopPropagation()}>
                        {stageIdx > 0 && (
                          <button
                            className={styles.navBtn}
                            title="Move back"
                            onClick={() => handleMove(item, 'back')}
                          >
                            <ChevronLeft size={14} strokeWidth={2} />
                          </button>
                        )}
                        {stageIdx < STAGES.length - 1 && (
                          <button
                            className={styles.navBtn}
                            title="Move forward"
                            onClick={() => handleMove(item, 'forward')}
                          >
                            <ChevronRight size={14} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {stageItems.length === 0 && (
                  <div className={styles.emptyColumn}>No items</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New idea"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="pipeline-form" loading={isSubmitting}>Save idea</Button>
          </>
        }
      >
        <PipelineItemForm
          painPoints={painPoints}
          teamMembers={teamMembers}
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit */}
      <SlideOver
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit idea"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="pipeline-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editItem && (
          <PipelineItemForm
            key={editItem.id}
            mode="edit"
            defaultValues={editItem}
            painPoints={painPoints}
            teamMembers={teamMembers}
            onSuccess={() => { setEditItem(null); router.refresh(); }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </SlideOver>
    </div>
  );
}
