import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { TasksView } from '@/components/tasks/TasksView';

export default async function TasksPage() {
  const supabase = await createClient();

  const { data: tasks, count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('status', 'active');

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, full_name');

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name')
    .order('first_name')
    .limit(100);

  return (
    <>
      <PageHeader title="Tasks" />
      <TasksView
        initialTasks={tasks || []}
        totalCount={count || 0}
        projects={projects || []}
        teamMembers={teamMembers || []}
        contacts={contacts || []}
      />
    </>
  );
}
