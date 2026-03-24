import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { BrandView } from '@/components/brand/BrandView';

export default async function BrandPage() {
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from('brand_assets')
    .select('*')
    .order('name');

  return (
    <>
      <PageHeader title="Brand Hub" />
      <BrandView assets={assets || []} />
    </>
  );
}
