import { createClient } from '@/lib/supabase/server';
import { getCachedTeamMembers } from '@/lib/queries/cached';
import { ProjectsView } from '@/components/projects/ProjectsView';

export async function ProjectsContent() {
  const supabase = await createClient();

  const [{ data: projects }, teamMembers] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    getCachedTeamMembers(),
  ]);

  return (
    <ProjectsView
      projects={projects ?? []}
      teamMembers={teamMembers}
    />
  );
}
