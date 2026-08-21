import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { AdvisorDetail } from '@/components/advisors/AdvisorDetail';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';
import { idColumn } from '@/lib/utils';

export default async function AdvisorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: advisor } = await supabase
    .from('advisors_partners')
    .select(`
      *,
      companies(id, name),
      key_relationship:team_members!advisors_partners_key_relationship_id_fkey(id, full_name),
      created_by_member:team_members!advisors_partners_created_by_fkey(id, full_name)
    `)
    .eq(idColumn(id), id)
    .single();

  if (!advisor) notFound();

  const [
    { data: contacts },
    { data: watches },
    { data: changes },
    companies,
    teamMembers,
    { data: allContacts },
  ] = await Promise.all([
    supabase
      .from('advisor_partner_contacts')
      .select('id, role, contacts(id, first_name, last_name, email)')
      .eq('advisor_partner_id', advisor.id),
    supabase
      .from('ecosystem_watches')
      .select('id, watch_type, label, source_url, enabled, check_frequency, health, last_checked_at, last_change_at')
      .eq('advisor_partner_id', advisor.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('ecosystem_changes')
      .select('id, change_type, title, summary, severity, curator_note, occurred_at, detected_at, external_url')
      .eq('advisor_partner_id', advisor.id)
      .not('status', 'in', '("dismissed","archived")')
      .order('detected_at', { ascending: false })
      .limit(10),
    getCompanyOptions(),
    getTeamMemberOptions(supabase),
    supabase.from('contacts').select('id, first_name, last_name, email').order('first_name'),
  ]);

  const contactIds = (contacts ?? [])
    .map((c: { contacts: { id: string } | null }) => c.contacts?.id)
    .filter((cid: string | undefined): cid is string => !!cid);

  const { data: interactions } = contactIds.length > 0
    ? await supabase
        .from('interactions')
        .select('id, type, summary, occurred_at, contact_id, contacts(first_name, last_name)')
        .in('contact_id', contactIds)
        .order('occurred_at', { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <>
      <PageHeader title={advisor.name} backHref="/advisors" />
      <AdvisorDetail
        advisor={advisor as typeof advisor & { type: 'advisor' | 'partner' }}
        contacts={contacts ?? []}
        interactions={interactions ?? []}
        watches={watches ?? []}
        changes={changes ?? []}
        companies={companies ?? []}
        teamMembers={teamMembers ?? []}
        allContacts={allContacts ?? []}
      />
    </>
  );
}
