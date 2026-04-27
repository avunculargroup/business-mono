import { createClient } from '@/lib/supabase/server';
import { AdvisorsView } from '@/components/advisors/AdvisorsView';

export async function AdvisorsContent() {
  const supabase = await createClient();

  const [
    { data: advisors },
    { data: companies },
    { data: teamMembers },
  ] = await Promise.all([
    supabase
      .from('advisors_partners')
      .select('id, name, type, specialization, active, logo_url, company_id, key_relationship_id, companies(name), team_members!advisors_partners_key_relationship_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
  ]);

  return (
    <AdvisorsView
      advisors={advisors ?? []}
      companies={companies ?? []}
      teamMembers={teamMembers ?? []}
    />
  );
}
