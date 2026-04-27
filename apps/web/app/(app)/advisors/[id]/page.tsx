import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { AdvisorDetail } from '@/components/advisors/AdvisorDetail';

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
    .eq('id', id)
    .single();

  if (!advisor) notFound();

  const [
    { data: contacts },
    { data: companies },
    { data: teamMembers },
    { data: allContacts },
  ] = await Promise.all([
    supabase
      .from('advisor_partner_contacts')
      .select('id, role, contacts(id, first_name, last_name, email)')
      .eq('advisor_partner_id', id),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
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
      <PageHeader title={advisor.name} />
      <AdvisorDetail
        advisor={advisor as typeof advisor & { type: 'advisor' | 'partner' }}
        contacts={contacts ?? []}
        interactions={interactions ?? []}
        companies={companies ?? []}
        teamMembers={teamMembers ?? []}
        allContacts={allContacts ?? []}
      />
    </>
  );
}
