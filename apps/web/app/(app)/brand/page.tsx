import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Plus, Bookmark } from 'lucide-react';
import styles from './brand.module.css';

export default async function BrandPage() {
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from('brand_assets')
    .select('*')
    .order('name');

  return (
    <>
      <PageHeader title="Brand Hub">
        <Button variant="primary" size="sm">
          <Plus size={16} strokeWidth={1.5} />
          Add asset
        </Button>
      </PageHeader>
      <div className={styles.container}>
        {assets && assets.length > 0 ? (
          <div className={styles.grid}>
            {assets.map((asset) => (
              <Card key={asset.id} hoverable padding="md">
                <h3 className={styles.assetName}>{asset.name}</h3>
                <StatusChip label={asset.type.replace('_', ' ')} color="accent" />
                {asset.content && (
                  <p className={styles.description}>
                    {asset.content.length > 120 ? `${asset.content.slice(0, 120)}...` : asset.content}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Bookmark size={48} strokeWidth={1} />
            <h3>No brand assets yet</h3>
            <p>Add brand materials like logos, colour palettes, and tone guides.</p>
          </div>
        )}
      </div>
    </>
  );
}
