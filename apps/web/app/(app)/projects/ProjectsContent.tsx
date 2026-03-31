import { createClient } from '@/lib/supabase/server';
import { ProjectsView } from '@/components/projects/ProjectsView';

export async function ProjectsContent() {
  const supabase = await createClient();

  const [{ data: projects }, { data: teamMembers }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, full_name'),
  ]);

  return (
    <ProjectsView
      projects={projects ?? []}
      teamMembers={teamMembers ?? []}
    />
  );
}
