import { createClient } from '@/lib/supabase/server';
import { TasksView } from '@/components/tasks/TasksView';

export async function TasksContent() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: projects }, { data: contacts }, { data: teamMembers }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('projects')
      .select('id, name')
      .eq('status', 'active'),
    supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .order('first_name')
      .limit(100),
    supabase
      .from('team_members')
      .select('id, full_name'),
  ]);

  return (
    <TasksView
      initialTasks={tasks ?? []}
      projects={projects ?? []}
      teamMembers={teamMembers ?? []}
      contacts={contacts ?? []}
    />
  );
}
