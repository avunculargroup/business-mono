import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { ProductDetail } from '@/components/products/ProductDetail';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products_services')
    .select(`
      *,
      companies(id, name),
      key_relationship:team_members!products_services_key_relationship_id_fkey(id, full_name),
      created_by_member:team_members!products_services_created_by_fkey(id, full_name)
    `)
    .eq('id', id)
    .single();

  if (!product) notFound();

  const [
    { data: keyContacts },
    { data: agreements },
    { data: companies },
    { data: teamMembers },
    { data: allContacts },
  ] = await Promise.all([
    supabase
      .from('product_key_contacts')
      .select('id, role, contacts(id, first_name, last_name, email)')
      .eq('product_service_id', id),
    supabase
      .from('product_referral_agreements')
      .select('*')
      .eq('product_service_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
    supabase.from('contacts').select('id, first_name, last_name, email').order('first_name'),
  ]);

  const contactIds = (keyContacts ?? [])
    .map((kc: { contacts: { id: string } | null }) => kc.contacts?.id)
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
      <PageHeader title={product.name} />
      <ProductDetail
        product={product}
        keyContacts={keyContacts ?? []}
        agreements={agreements ?? []}
        interactions={interactions ?? []}
        companies={companies ?? []}
        teamMembers={teamMembers ?? []}
        allContacts={allContacts ?? []}
      />
    </>
  );
}
