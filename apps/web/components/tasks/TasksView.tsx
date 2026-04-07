'use client';

import { useState, useCallback } from 'react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { TaskForm } from './TaskForm';
import { KanbanBoard } from './KanbanBoard';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { formatRelativeDate } from '@/lib/utils';
import { Plus, List, LayoutGrid, CheckSquare } from 'lucide-react';
import { updateTaskStatus } from '@/app/actions/tasks';
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
  const { items: tasks, optimisticAdd } = useOptimisticList(initialTasks);

  const handleTaskCreated = useCallback((task?: TaskRow) => {
    if (task) {
      optimisticAdd(task, async () => {
        // Server action already called by the form — this is a no-op
        // The optimistic add happens immediately when the form succeeds
      });
    }
    setShowCreate(false);
  }, [optimisticAdd]);

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

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="task-form">Save task</Button>
          </>
        }
      >
        <TaskForm
          projects={projects}
          teamMembers={teamMembers}
          contacts={contacts}
          onSuccess={handleTaskCreated}
        />
      </SlideOver>
    </div>
  );
}
