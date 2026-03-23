import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { AgentActivityCard } from '@/components/agent/AgentActivityCard';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { PipelineChip } from '@/components/ui/PipelineChip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatRelativeDate } from '@/lib/utils';
import Link from 'next/link';
import styles from './dashboard.module.css';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parallel data fetching
  const [
    { data: pendingActivities },
    { data: openTasks },
    { data: recentActivity },
    { data: followUpContacts },
    { data: contentCounts },
  ] = await Promise.all([
    supabase
      .from('agent_activity')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user!.id)
      .in('status', ['todo', 'in_progress', 'blocked'])
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true })
      .limit(8),
    supabase
      .from('agent_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('contacts')
      .select('id, first_name, last_name, pipeline_stage, updated_at')
      .in('pipeline_stage', ['warm', 'active'])
      .order('updated_at', { ascending: true })
      .limit(5),
    supabase
      .from('content_items')
      .select('status'),
  ]);

  // Count content by status
  const contentStatusCounts: Record<string, number> = {};
  if (contentCounts) {
    for (const item of contentCounts) {
      contentStatusCounts[item.status] = (contentStatusCounts[item.status] || 0) + 1;
    }
  }

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className={styles.grid}>
        {/* Left column */}
        <div className={styles.left}>
          {/* Pending Approvals */}
          <Card>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Pending Approvals</h2>
              <Link href="/activity" className={styles.viewAll}>View all →</Link>
            </div>
            {pendingActivities && pendingActivities.length > 0 ? (
              <div className={styles.approvalsList}>
                {pendingActivities.map((activity) => (
                  <AgentActivityCard key={activity.id} activity={activity} compact />
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No pending approvals</p>
            )}
          </Card>

          {/* Open Tasks */}
          <Card>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Open Tasks</h2>
              <Link href="/tasks" className={styles.viewAll}>View all →</Link>
            </div>
            {openTasks && openTasks.length > 0 ? (
              <div className={styles.tasksList}>
                {openTasks.map((task) => (
                  <div key={task.id} className={styles.taskRow}>
                    <div className={styles.taskInfo}>
                      <Link href={`/tasks/${task.id}`} className={styles.taskTitle}>{task.title}</Link>
                      {task.contact_id && (
                        <span className={styles.taskContact}>Contact linked</span>
                      )}
                    </div>
                    <PriorityChip priority={task.priority} />
                    {task.due_date && (
                      <span className={styles.dueDate}>{formatRelativeDate(task.due_date)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No open tasks</p>
            )}
          </Card>

          {/* Follow-ups */}
          <Card>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Upcoming Follow-ups</h2>
              <Link href="/crm/contacts" className={styles.viewAll}>View all →</Link>
            </div>
            {followUpContacts && followUpContacts.length > 0 ? (
              <div className={styles.tasksList}>
                {followUpContacts.map((contact) => (
                  <div key={contact.id} className={styles.taskRow}>
                    <Link href={`/crm/contacts/${contact.id}`} className={styles.taskTitle}>
                      {contact.first_name} {contact.last_name}
                    </Link>
                    <PipelineChip stage={contact.pipeline_stage} />
                    <span className={styles.dueDate}>{formatRelativeDate(contact.updated_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No follow-ups needed</p>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className={styles.right}>
          {/* Recent Agent Activity */}
          <Card>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Recent Agent Activity</h2>
              <Link href="/activity" className={styles.viewAll}>View all →</Link>
            </div>
            {recentActivity && recentActivity.length > 0 ? (
              <div className={styles.approvalsList}>
                {recentActivity.map((activity) => (
                  <AgentActivityCard key={activity.id} activity={activity} compact />
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No recent activity</p>
            )}
          </Card>

          {/* Content Pipeline Summary */}
          <Card>
            <h2 className={styles.widgetTitle}>Content Pipeline</h2>
            <div className={styles.contentCounts}>
              {['idea', 'draft', 'review', 'approved', 'scheduled', 'published'].map((status) => (
                <div key={status} className={styles.contentCount}>
                  <span className={styles.countValue}>{contentStatusCounts[status] || 0}</span>
                  <span className={styles.countLabel}>{status}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick-add */}
          <Card padding="sm">
            <div className={styles.quickAdd}>
              <Button variant="ghost" size="sm">+ Contact</Button>
              <Button variant="ghost" size="sm">+ Task</Button>
              <Button variant="ghost" size="sm">+ Content idea</Button>
              <Button variant="ghost" size="sm">+ Note</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
