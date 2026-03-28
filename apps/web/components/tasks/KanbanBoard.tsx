'use client';

import { useState, useOptimistic, useTransition } from 'react';
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

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, setOptimisticStatus] = useOptimistic(
    tasks,
    (currentTasks, { id, status }: { id: string; status: string }) =>
      currentTasks.map((t) => (t.id === id ? { ...t, status } : t))
  );

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    setError(null);
    startTransition(async () => {
      setOptimisticStatus({ id: taskId, status: newStatus });
      const result = await onStatusChange(taskId, newStatus);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  return (
    <div>
      {error && (
        <div className={styles.error} role="alert">
          Failed to update: {error}
          <button onClick={() => setError(null)} className={styles.dismissError}>Dismiss</button>
        </div>
      )}
      <div className={styles.board}>
        {columns.map((col) => {
          const colTasks = optimisticTasks.filter((t) => t.status === col.key);
          const isCollapsed = (col.key === 'done' || col.key === 'cancelled') && colTasks.length === 0;

          if (isCollapsed) return null;

          return (
            <div
              key={col.key}
              className={styles.column}
              onDrop={(e) => handleDrop(e, col.key)}
              onDragOver={handleDragOver}
            >
              <div className={styles.columnHeader}>
                <span className={styles.columnLabel}>{col.label}</span>
                <span className={styles.columnCount}>{colTasks.length}</span>
              </div>
              <div className={styles.cards}>
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className={styles.card}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                  >
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
