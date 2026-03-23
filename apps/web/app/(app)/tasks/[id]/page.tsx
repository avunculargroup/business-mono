import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import Link from 'next/link';
import styles from './task-detail.module.css';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single();

  if (!task) notFound();

  const statusColors: Record<string, 'neutral' | 'accent' | 'success' | 'destructive'> = {
    todo: 'neutral', in_progress: 'accent', blocked: 'destructive', done: 'success', cancelled: 'neutral',
  };

  return (
    <>
      <PageHeader title={task.title}>
        <PriorityChip priority={task.priority} />
        <StatusChip label={task.status.replace('_', ' ')} color={statusColors[task.status] || 'neutral'} />
      </PageHeader>
      <div className={styles.container}>
        {task.description && (
          <p className={styles.description}>{task.description}</p>
        )}

        <div className={styles.meta}>
          {task.project_id && (
            <div className={styles.field}>
              <span className={styles.label}>Project</span>
              <Link href={`/projects/${task.project_id}`}>View project</Link>
            </div>
          )}
          {task.contact_id && (
            <div className={styles.field}>
              <span className={styles.label}>Contact</span>
              <Link href={`/crm/contacts/${task.contact_id}`}>View contact</Link>
            </div>
          )}
          {task.assigned_to && (
            <div className={styles.field}>
              <span className={styles.label}>Assigned to</span>
              <span>{task.assigned_to}</span>
            </div>
          )}
          {task.due_date && (
            <div className={styles.field}>
              <span className={styles.label}>Due date</span>
              <span>{formatDate(task.due_date)} ({formatRelativeDate(task.due_date)})</span>
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.label}>Created</span>
            <span>{formatDate(task.created_at)}</span>
          </div>
          {task.completed_at && (
            <div className={styles.field}>
              <span className={styles.label}>Completed</span>
              <span>{formatDate(task.completed_at)}</span>
            </div>
          )}
          {task.source && (
            <div className={styles.field}>
              <span className={styles.label}>Source</span>
              <StatusChip label={task.source} color="neutral" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
