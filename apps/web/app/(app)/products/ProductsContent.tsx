import { createClient } from '@/lib/supabase/server';
import { ProductsView } from '@/components/products/ProductsView';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';

export async function ProductsContent() {
  const supabase = await createClient();

  const [{ data: products }, companies, teamMembers] = await Promise.all([
    supabase
      .from('products_services')
      .select('id, slug, name, business_name, category, australian_owned, logo_url, company_id, key_relationship_id, companies(name), team_members!products_services_key_relationship_id_fkey(full_name)')
      .order('created_at', { ascending: false }),
    getCompanyOptions(supabase),
    getTeamMemberOptions(supabase),
  ]);

  return (
    <ProductsView
      products={products ?? []}
      companies={companies}
      teamMembers={teamMembers}
    />
  );
}
