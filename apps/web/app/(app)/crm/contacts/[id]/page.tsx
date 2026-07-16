import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContactDetail } from '@/components/crm/ContactDetail';
import { idColumn } from '@/lib/utils';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq(idColumn(id), id)
    .single();

  if (!contact) notFound();

  // interactions, tasks, and the linked company all key off the resolved
  // contact id (the route param may be a slug), so fetch them together after it.
  const [{ data: interactions }, { data: tasks }, companyResult] = await Promise.all([
    supabase.from('interactions').select('*').eq('contact_id', contact.id).order('occurred_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .eq('contact_id', contact.id)
      .in('status', ['todo', 'in_progress', 'blocked']),
    contact.company_id
      ? supabase.from('companies').select('id, slug, name').eq('id', contact.company_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const company = companyResult.data;

  return (
    <>
      <PageHeader title={`${contact.first_name} ${contact.last_name}`} backHref="/crm/contacts" />
      <ContactDetail
        contact={{ ...contact, companies: company }}
        interactions={(interactions || []).map((i) => ({ ...i, team_members: null }))}
        openTaskCount={tasks?.length || 0}
      />
    </>
  );
}
