import { createClient } from '@/lib/supabase/server';
import { AdvisorsView, type AdvisorRow } from '@/components/advisors/AdvisorsView';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';

export async function AdvisorsContent() {
  const supabase = await createClient();

  const [{ data: advisors }, companies, teamMembers] = await Promise.all([
    supabase
      .from('advisors_partners')
      .select('id, slug, name, type, specialization, active, logo_url, company_id, key_relationship_id, companies(name), team_members!advisors_partners_key_relationship_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    getCompanyOptions(supabase),
    getTeamMemberOptions(supabase),
  ]);

  return (
    <AdvisorsView
      advisors={(advisors ?? []) as unknown as AdvisorRow[]}
      companies={companies}
      teamMembers={teamMembers}
    />
  );
}
