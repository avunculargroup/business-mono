'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { BrandAssetForm } from './BrandAssetForm';
import { Plus, Bookmark } from 'lucide-react';
import styles from '@/app/(app)/brand/brand.module.css';

type BrandAsset = {
  id: string;
  name: string;
  type: string;
  content: string | null;
};

interface BrandViewProps {
  assets: BrandAsset[];
}

export function BrandView({ assets }: BrandViewProps) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-4) var(--space-6) 0' }}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add asset
        </Button>
      </div>
      <div className={styles.container}>
        {assets.length > 0 ? (
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
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add asset</Button>
          </div>
        )}
      </div>

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add asset"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="brand-asset-form">Save asset</Button>
          </>
        }
      >
        <BrandAssetForm onSuccess={() => setShowCreate(false)} />
      </SlideOver>
    </>
  );
}
