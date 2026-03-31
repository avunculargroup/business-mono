import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { StatusChip } from '@/components/ui/StatusChip';
import { TaskDetailActions } from '@/components/tasks/TaskDetailActions';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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

  // Fetch related entity names and lookup lists in parallel
  const [
    projectResult,
    contactResult,
    { data: teamMembers },
    { data: allProjects },
    { data: allContacts },
  ] = await Promise.all([
    task.project_id
      ? supabase.from('projects').select('id, name').eq('id', task.project_id).single()
      : Promise.resolve({ data: null }),
    task.related_contact_id
      ? supabase.from('contacts').select('id, first_name, last_name').eq('id', task.related_contact_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('team_members').select('id, full_name'),
    supabase.from('projects').select('id, name').eq('status', 'active'),
    supabase.from('contacts').select('id, first_name, last_name').order('first_name').limit(100),
  ]);

  const project = projectResult?.data;
  const contact = contactResult?.data;
  const assignee = (teamMembers ?? []).find((m) => m.id === task.assigned_to);

  const statusColors: Record<string, 'neutral' | 'accent' | 'success' | 'destructive'> = {
    todo: 'neutral', in_progress: 'accent', blocked: 'destructive', done: 'success', cancelled: 'neutral',
  };

  return (
    <>
      <PageHeader title={task.title}>
        <PriorityChip priority={task.priority} />
        <StatusChip label={task.status.replace('_', ' ')} color={statusColors[task.status] || 'neutral'} />
        <TaskDetailActions
          task={task}
          projects={allProjects ?? []}
          teamMembers={teamMembers ?? []}
          contacts={allContacts ?? []}
        />
      </PageHeader>
      <div className={styles.container}>
        <Link href="/tasks" className={styles.backLink}>
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to tasks
        </Link>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Description</h3>
          {task.description ? (
            <p className={styles.description}>{task.description}</p>
          ) : (
            <p className={styles.emptyValue}>No description</p>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Details</h3>
          <div className={styles.meta}>
            <div className={styles.field}>
              <span className={styles.label}>Project</span>
              {project ? (
                <Link href={`/projects/${project.id}`}>{project.name}</Link>
              ) : (
                <span className={styles.emptyValue}>&mdash;</span>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Contact</span>
              {contact ? (
                <Link href={`/crm/contacts/${contact.id}`}>{contact.first_name} {contact.last_name}</Link>
              ) : (
                <span className={styles.emptyValue}>&mdash;</span>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Assigned to</span>
              <span>{assignee?.full_name ?? <span className={styles.emptyValue}>&mdash;</span>}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Due date</span>
              {task.due_date ? (
                <span>{formatDate(task.due_date)} ({formatRelativeDate(task.due_date)})</span>
              ) : (
                <span className={styles.emptyValue}>&mdash;</span>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Created</span>
              <span>{formatDate(task.created_at)}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Completed</span>
              {task.completed_at ? (
                <span>{formatDate(task.completed_at)}</span>
              ) : (
                <span className={styles.emptyValue}>&mdash;</span>
              )}
            </div>

            {task.source && (
              <div className={styles.field}>
                <span className={styles.label}>Source</span>
                <StatusChip label={task.source} color="neutral" />
              </div>
            )}

            {task.tags && task.tags.length > 0 && (
              <div className={styles.field}>
                <span className={styles.label}>Tags</span>
                <span>{task.tags.join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
