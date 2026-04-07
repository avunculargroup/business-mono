'use client';

import { useState, useOptimistic, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { formatRelativeDate } from '@/lib/utils';
import styles from './KanbanBoard.module.css';

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  related_contact_id: string | null;
  assigned_to: string | null;
};

const columns = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

interface KanbanBoardProps {
  tasks: TaskRow[];
  onStatusChange: (id: string, status: string) => Promise<{ error?: string } | void>;
}

function KanbanCard({ task, isDragOverlay }: { task: TaskRow; isDragOverlay?: boolean }) {
  return (
    <div className={`${styles.card} ${isDragOverlay ? styles.cardOverlay : ''}`}>
      <span className={styles.cardTitle}>{task.title}</span>
      <div className={styles.cardMeta}>
        <PriorityChip priority={task.priority} />
        {task.assigned_to && (
          <span className={styles.assignee}>Assigned</span>
        )}
        {task.due_date && (
          <span className={styles.dueDate}>{formatRelativeDate(task.due_date)}</span>
        )}
      </div>
      {task.related_contact_id && (
        <span className={styles.contact}>Contact linked</span>
      )}
    </div>
  );
}

function DraggableCard({ task }: { task: TaskRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${styles.cardWrapper} ${isDragging ? styles.cardDragging : ''}`}
    >
      <KanbanCard task={task} />
    </div>
  );
}

function DroppableColumn({
  columnKey,
  label,
  tasks,
  isOver,
  isEmpty,
}: {
  columnKey: string;
  label: string;
  tasks: TaskRow[];
  isOver: boolean;
  isEmpty: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.columnOver : ''} ${isEmpty ? styles.columnEmpty : ''}`}
    >
      <div className={styles.columnHeader}>
        <span className={styles.columnLabel}>{label}</span>
        <span className={styles.columnCount}>{tasks.length}</span>
      </div>
      <div className={styles.cards}>
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {isEmpty && !isOver && (
          <div className={styles.emptyPlaceholder}>
            Drop here
          </div>
        )}
        {isOver && (
          <div className={styles.dropIndicator} />
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, setOptimisticStatus] = useOptimistic(
    tasks,
    (currentTasks, { id, status }: { id: string; status: string }) =>
      currentTasks.map((t) => (t.id === id ? { ...t, status } : t))
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = optimisticTasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId && columns.some((c) => c.key === overId)) {
      setOverColumn(overId);
    } else {
      setOverColumn(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    setOverColumn(null);

    const taskId = event.active.id as string;
    const newStatus = event.over?.id as string | undefined;

    if (!newStatus || !columns.some((c) => c.key === newStatus)) return;

    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setError(null);
    startTransition(async () => {
      setOptimisticStatus({ id: taskId, status: newStatus });
      const result = await onStatusChange(taskId, newStatus);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    });
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setOverColumn(null);
  };

  return (
    <div>
      {error && (
        <div className={styles.error} role="alert">
          Failed to update: {error}
          <button onClick={() => setError(null)} className={styles.dismissError}>Dismiss</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.board}>
          {columns.map((col) => {
            const colTasks = optimisticTasks.filter((t) => t.status === col.key);
            return (
              <DroppableColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                tasks={colTasks}
                isOver={overColumn === col.key}
                isEmpty={colTasks.length === 0}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        }}>
          {activeTask ? <KanbanCard task={activeTask} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
