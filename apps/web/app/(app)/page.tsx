import { createClient } from '@/lib/supabase/server';
import { getRepositories } from '@/lib/repositories';
import { resolveReadContext } from '@platform/data-supabase';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { PriorityChip } from '@platform/ui/PriorityChip';
import { Card } from '@platform/ui/Card';
import { QuickAdd } from '@/components/dashboard/QuickAdd';
import { RoutineTile } from '@/components/dashboard/RoutineTile';
import { FearGreedIndicator } from '@/components/dashboard/FearGreedIndicator';
import { BitcoinPriceAUD } from '@/components/dashboard/BitcoinPriceAUD';
import { BitcoinPriceUSD } from '@/components/dashboard/BitcoinPriceUSD';
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

  const repositories = await getRepositories();

  // Parallel data fetching. Tasks, projects, contacts and routines belong to
  // verticals 4.6-4.11 and are still read on the raw client; the indicator
  // block comes through the repository as one call.
  const [
    { data: openTasks },
    companies,
    teamMembers,
    { data: activeProjects },
    { data: allContacts },
    { data: dashboardRoutines },
    indicators,
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user!.id)
      .in('status', ['todo', 'in_progress', 'blocked'])
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true })
      .limit(8),
    getCompanyOptions(supabase),
    getTeamMemberOptions(supabase),
    supabase.from('projects').select('id, name').eq('status', 'active'),
    supabase.from('contacts').select('id, first_name, last_name').order('first_name').limit(100),
    supabase
      .from('routines')
      .select('id, name, dashboard_title, last_run_at, last_result, timezone')
      .eq('show_on_dashboard', true)
      .eq('is_active', true)
      .not('last_result', 'is', null)
      .order('last_run_at', { ascending: false }),
    repositories.indicators.getDashboard(resolveReadContext()),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" logoOnMobile />
      <div className={styles.banner}>
        <FearGreedIndicator />
        <BitcoinPriceAUD />
        <BitcoinPriceUSD />
        <BlockHeight />
        <OpenRouterCredits />
      </div>
      <TrendValuation latest={indicators.onchainLatest} series={indicators.onchainSeries} />
      <MacroIndicators latest={indicators.macroLatest} series={indicators.macroSeries} />
      <OnchainIndicators latest={indicators.onchainLatest} series={indicators.onchainSeries} />
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
                      <Link href={`/tasks/${task.slug}`} className={styles.taskTitle}>{task.title}</Link>
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
