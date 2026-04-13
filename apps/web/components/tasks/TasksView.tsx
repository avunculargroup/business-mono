'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TaskForm } from './TaskForm';
import { KanbanBoard } from './KanbanBoard';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { formatRelativeDate } from '@/lib/utils';
import { Plus, List, LayoutGrid, CheckSquare, Pencil, Trash2 } from 'lucide-react';
import { updateTaskStatus, deleteTask } from '@/app/actions/tasks';
import { useToast } from '@/providers/ToastProvider';
import Link from 'next/link';
import styles from './TasksView.module.css';

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  related_contact_id: string | null;
  project_id: string | null;
  assigned_to: string | null;
};

interface TasksViewProps {
  initialTasks: TaskRow[];
  projects: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
}

const statusColors: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'> = {
  todo: 'neutral',
  in_progress: 'accent',
  blocked: 'destructive',
  done: 'success',
  cancelled: 'neutral',
};

export function TasksView({ initialTasks, projects, teamMembers, contacts }: TasksViewProps) {
  const [view, setView] = useLocalStorage<'list' | 'board'>('tasks-view', 'list');
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { success, error } = useToast();
  const { items: tasks, optimisticAdd } = useOptimisticList(initialTasks);

  const handleTaskCreated = useCallback((task?: TaskRow) => {
    if (task) {
      optimisticAdd(task, async () => {
        // Server action already called by the form — optimistic add only
      });
    }
    setShowCreate(false);
  }, [optimisticAdd]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteTask(deleteTarget.id);
    setIsDeleting(false);
    if (result.error) {
      error(result.error);
    } else {
      success('Task deleted');
      setDeleteTarget(null);
      router.refresh();
    }
  };

  const columns: Column<TaskRow>[] = [
    {
      key: 'title',
      header: 'Title',
      width: '30%',
      render: (row) => (
        <Link href={`/tasks/${row.id}`} className={styles.taskLink}>
          {row.title}
        </Link>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '15%',
      render: (row) => {
        const p = projects.find((pr) => pr.id === row.project_id);
        return p?.name || '\u2014';
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      width: '15%',
      render: (row) => {
        const c = contacts.find((ct) => ct.id === row.related_contact_id);
        return c ? `${c.first_name} ${c.last_name}` : '\u2014';
      },
    },
    {
      key: 'assignee',
      header: 'Assignee',
      width: '12%',
      render: (row) => {
        const m = teamMembers.find((tm) => tm.id === row.assigned_to);
        return m?.full_name || '\u2014';
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '10%',
      render: (row) => <PriorityChip priority={row.priority} />,
    },
    {
      key: 'due_date',
      header: 'Due',
      width: '10%',
      render: (row) => row.due_date ? (
        <span className={styles.mono}>{formatRelativeDate(row.due_date)}</span>
      ) : '\u2014',
    },
    {
      key: 'status',
      header: 'Status',
      width: '8%',
      render: (row) => (
        <StatusChip label={row.status.replace('_', ' ')} color={statusColors[row.status] || 'neutral'} />
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${view === 'list' ? styles.active : ''}`}
            onClick={() => setView('list')}
          >
            <List size={16} strokeWidth={1.5} />
          </button>
          <button
            className={`${styles.toggleBtn} ${view === 'board' ? styles.active : ''}`}
            onClick={() => setView('board')}
          >
            <LayoutGrid size={16} strokeWidth={1.5} />
          </button>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add task
        </Button>
      </div>

      {view === 'list' ? (
        <DataTable
          columns={columns}
          data={tasks}
          rowKey={(row) => row.id}
          rowActions={(row) => [
            {
              label: 'Edit',
              icon: <Pencil size={14} strokeWidth={1.5} />,
              onClick: () => setEditTask(row),
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} strokeWidth={1.5} />,
              onClick: () => setDeleteTarget(row),
              destructive: true,
            },
          ]}
          pagination={{ page: 1, pageSize: 25, total: tasks.length, onPageChange: () => {} }}
          emptyState={
            <div className={styles.empty}>
              <CheckSquare size={48} strokeWidth={1} />
              <h3>No tasks yet</h3>
              <p>Create your first task to start tracking work.</p>
              <Button variant="primary" onClick={() => setShowCreate(true)}>Add task</Button>
            </div>
          }
        />
      ) : (
        <KanbanBoard
          tasks={tasks}
          onStatusChange={async (id, status) => {
            return await updateTaskStatus(id, status);
          }}
        />
      )}

      {/* Create slide-over */}
      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="task-form" loading={isSubmitting}>Save task</Button>
          </>
        }
      >
        <TaskForm
          projects={projects}
          teamMembers={teamMembers}
          contacts={contacts}
          onSuccess={handleTaskCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>

      {/* Edit slide-over */}
      <SlideOver
        open={!!editTask}
        onClose={() => setEditTask(null)}
        title="Edit task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTask(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="task-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        {editTask && (
          <TaskForm
            key={editTask.id}
            projects={projects}
            teamMembers={teamMembers}
            contacts={contacts}
            mode="edit"
            defaultValues={{ ...editTask, description: null }}
            onSuccess={() => {
              setEditTask(null);
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
        title="Delete task"
        description={`Permanently delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete task"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
