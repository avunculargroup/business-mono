import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContactsList } from '@/components/crm/ContactsList';

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts, count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(25);

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name');

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name');

  return (
    <>
      <PageHeader title="Contacts" />
      <ContactsList
        initialContacts={contacts || []}
        totalCount={count || 0}
        companies={companies || []}
        teamMembers={teamMembers || []}
      />
    </>
  );
}
