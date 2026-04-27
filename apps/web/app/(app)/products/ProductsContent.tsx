import { createClient } from '@/lib/supabase/server';
import { ProductsView } from '@/components/products/ProductsView';

export async function ProductsContent() {
  const supabase = await createClient();

  const [
    { data: products },
    { data: companies },
    { data: teamMembers },
  ] = await Promise.all([
    supabase
      .from('products_services')
      .select('id, name, business_name, category, australian_owned, logo_url, company_id, key_relationship_id, companies(name), team_members!products_services_key_relationship_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('team_members').select('id, full_name'),
  ]);

  return (
    <ProductsView
      products={products ?? []}
      companies={companies ?? []}
      teamMembers={teamMembers ?? []}
    />
  );
}
