import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContactsList } from '@/components/crm/ContactsList';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts, count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(25);

  const [companies, teamMembers] = await Promise.all([
    getCompanyOptions(supabase),
    getTeamMemberOptions(supabase),
  ]);

  return (
    <>
      <PageHeader title="Contacts" />
      <ContactsList
        initialContacts={contacts || []}
        totalCount={count || 0}
        companies={companies}
        teamMembers={teamMembers}
      />
    </>
  );
}
