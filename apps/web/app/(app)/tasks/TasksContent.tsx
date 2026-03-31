import { createClient } from '@/lib/supabase/server';
import { getCachedTeamMembers } from '@/lib/queries/cached';
import { TasksView } from '@/components/tasks/TasksView';

export async function TasksContent() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: projects }, { data: contacts }, teamMembers] = await Promise.all([
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
    getCachedTeamMembers(),
  ]);

  return (
    <TasksView
      initialTasks={tasks ?? []}
      projects={projects ?? []}
      teamMembers={teamMembers}
      contacts={contacts ?? []}
    />
  );
}
