import { createClient } from '@/lib/supabase/server';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { getTeamMemberOptions } from '@/lib/referenceData';

export async function ProjectsContent() {
  const supabase = await createClient();

  const [{ data: projects }, teamMembers] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    getTeamMemberOptions(supabase),
  ]);

  return (
    <ProjectsView
      projects={projects ?? []}
      teamMembers={teamMembers}
    />
  );
}
