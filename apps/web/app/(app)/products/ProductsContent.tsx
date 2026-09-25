import { createClient } from '@/lib/supabase/server';
import { ProductsView } from '@/components/products/ProductsView';
import { getCompanyOptions, getTeamMemberOptions } from '@/lib/referenceData';
import { pickFeatured } from '@/lib/products/images';
import { signProductImages } from '@/lib/products/signImages';

export async function ProductsContent() {
  const supabase = await createClient();

  const [{ data: products }, companies, teamMembers] = await Promise.all([
    supabase
      .from('products_services')
      .select('id, slug, name, business_name, category, australian_owned, logo_url, featured_image_id, company_id, key_relationship_id, companies(name), team_members!products_services_key_relationship_id_fkey(full_name), product_images!product_images_product_service_id_fkey(id, storage_path, filename, alt_text, width, height, focal_x, focal_y, sort_order, created_at)')
      .order('created_at', { ascending: false }),
    getCompanyOptions(),
    getTeamMemberOptions(supabase),
  ]);

  // Only the featured image of each product is shown, so only those are signed.
  const rows = products ?? [];
  const featuredRows = rows.flatMap((p) => {
    const featured = pickFeatured(p.product_images, p.featured_image_id);
    return featured ? [featured] : [];
  });
  const signed = new Map((await signProductImages(supabase, featuredRows)).map((img) => [img.id, img]));

  return (
    <ProductsView
      products={rows.map(({ product_images, ...p }) => {
        const featured = pickFeatured(product_images, p.featured_image_id);
        return { ...p, featured_image: featured ? signed.get(featured.id) ?? null : null };
      })}
      companies={companies}
      teamMembers={teamMembers}
    />
  );
}
