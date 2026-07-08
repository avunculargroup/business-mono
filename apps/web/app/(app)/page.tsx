import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PriorityChip } from '@/components/ui/PriorityChip';
import { Card } from '@/components/ui/Card';
import { QuickAdd } from '@/components/dashboard/QuickAdd';
import { RoutineTile } from '@/components/dashboard/RoutineTile';
import { FearGreedIndicator } from '@/components/dashboard/FearGreedIndicator';
import { BitcoinPriceAUD } from '@/components/dashboard/BitcoinPriceAUD';
import { BlockHeight } from '@/components/dashboard/BlockHeight';
import { OpenRouterCredits } from '@/components/dashboard/OpenRouterCredits';
import { MacroIndicators } from '@/components/dashboard/MacroIndicators';
import { OnchainIndicators } from '@/components/dashboard/OnchainIndicators';
import { TrendValuation } from '@/components/dashboard/TrendValuation';
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
    { data: openTasks },
    { data: companies },
    { data: teamMembers },
    { data: activeProjects },
    { data: allContacts },
    { data: dashboardRoutines },
    { data: indicatorLatest },
    { data: indicatorSeries },
    { data: onchainLatest },
    { data: onchainSeries },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user!.id)
      .in('status', ['todo', 'in_progress', 'blocked'])
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true })
      .limit(8),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
    supabase.from('projects').select('id, name').eq('status', 'active'),
    supabase.from('contacts').select('id, first_name, last_name').order('first_name').limit(100),
    supabase
      .from('routines')
      .select('id, name, dashboard_title, last_run_at, last_result, timezone')
      .eq('show_on_dashboard', true)
      .eq('is_active', true)
      .not('last_result', 'is', null)
      .order('last_run_at', { ascending: false }),
    supabase.from('v_indicator_latest').select('*'),
    supabase.from('v_indicator_series').select('*'),
    supabase.from('v_onchain_dashboard').select('*'),
    supabase.from('v_onchain_series').select('*'),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" logoOnMobile />
      <div className={styles.banner}>
        <FearGreedIndicator />
        <BitcoinPriceAUD />
        <BlockHeight />
        <OpenRouterCredits />
      </div>
      <TrendValuation latest={onchainLatest ?? []} />
      <MacroIndicators latest={indicatorLatest ?? []} series={indicatorSeries ?? []} />
      <OnchainIndicators latest={onchainLatest ?? []} series={onchainSeries ?? []} />
      <div className={styles.grid}>
        {/* Left column */}
        <div className={styles.left}>
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
                      {task.related_contact_id && (
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
        </div>

        {/* Right column */}
        <div className={styles.right}>
          {/* Dashboard routine tiles */}
          {dashboardRoutines?.map((r) => (
            <RoutineTile
              key={r.id}
              routine={{
                id: r.id,
                name: r.name,
                dashboard_title: r.dashboard_title,
                last_run_at: r.last_run_at,
                last_result: r.last_result as React.ComponentProps<typeof RoutineTile>['routine']['last_result'],
                timezone: r.timezone,
              }}
            />
          ))}

          {/* Quick-add */}
          <Card padding="sm">
            <div className={styles.quickAdd}>
              <QuickAdd
                companies={companies || []}
                teamMembers={teamMembers || []}
                projects={activeProjects || []}
                contacts={allContacts || []}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
