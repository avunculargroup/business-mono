import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { PriorityChip } from '@/components/ui/PriorityChip';
import Link from 'next/link';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import styles from '../projects.module.css';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_date')
    .eq('project_id', id)
    .order('status')
    .order('priority');

  const statusColors: Record<string, 'accent' | 'success' | 'warning' | 'neutral' | 'destructive'> = {
    active: 'accent', completed: 'success', on_hold: 'warning', archived: 'neutral',
  };

  const taskStatusColors: Record<string, 'neutral' | 'accent' | 'success' | 'destructive'> = {
    todo: 'neutral', in_progress: 'accent', blocked: 'destructive', done: 'success', cancelled: 'neutral',
  };

  return (
    <>
      <PageHeader title={project.name}>
        <StatusChip label={project.status.replace('_', ' ')} color={statusColors[project.status] || 'neutral'} />
      </PageHeader>
      <div className={styles.container}>
        {project.description && <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>{project.description}</p>}

        <div style={{ display: 'flex', gap: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-6)' }}>
          {project.owner_id && <span>Owner assigned</span>}
          {project.target_date && <span>Target: {formatDate(project.target_date)}</span>}
          <span>Created: {formatDate(project.created_at)}</span>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Tasks</h2>
        {tasks && tasks.length > 0 ? (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ flex: 1, fontWeight: 500 }}>{task.title}</span>
                <PriorityChip priority={task.priority} />
                <StatusChip label={task.status.replace('_', ' ')} color={taskStatusColors[task.status] || 'neutral'} />
                {task.due_date && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{formatRelativeDate(task.due_date)}</span>}
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-tertiary)' }}>No tasks in this project.</p>
        )}
      </div>
    </>
  );
}
