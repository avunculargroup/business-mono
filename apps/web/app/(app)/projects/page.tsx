import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ProjectsView } from '@/components/projects/ProjectsView';

export default async function ProjectsPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: teamMembers }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, full_name'),
  ]);

  return (
    <>
      <PageHeader title="Projects" />
      <ProjectsView projects={projects || []} teamMembers={teamMembers || []} />
    </>
  );
}
