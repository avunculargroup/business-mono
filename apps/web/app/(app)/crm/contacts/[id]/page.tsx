import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ContactDetail } from '@/components/crm/ContactDetail';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single();

  if (!contact) notFound();

  // Fetch company name if linked
  let company: { id: string; name: string } | null = null;
  if (contact.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', contact.company_id)
      .single();
    company = data;
  }

  const { data: interactions } = await supabase
    .from('interactions')
    .select('*')
    .eq('contact_id', id)
    .order('occurred_at', { ascending: false });

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_date')
    .eq('related_contact_id', id)
    .in('status', ['todo', 'in_progress', 'blocked']);

  return (
    <>
      <PageHeader title={`${contact.first_name} ${contact.last_name}`} />
      <ContactDetail
        contact={{ ...contact, companies: company }}
        interactions={(interactions || []).map((i) => ({ ...i, team_members: null }))}
        openTaskCount={tasks?.length || 0}
      />
    </>
  );
}
