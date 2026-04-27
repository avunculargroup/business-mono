'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { StatusChip } from '@/components/ui/StatusChip';
import { ProductForm } from './ProductForm';
import styles from '@/app/(app)/products/products.module.css';

type ProductRow = {
  id: string;
  name: string;
  business_name: string | null;
  category: string | null;
  australian_owned: boolean;
  logo_url: string | null;
  company_id: string | null;
  key_relationship_id: string | null;
  companies: { name: string } | null;
  team_members: { full_name: string } | null;
};

interface ProductsViewProps {
  products: ProductRow[];
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
}

const categoryLabels: Record<string, string> = {
  custody:             'Custody',
  exchange:            'Exchange',
  wallet_software:     'Wallet software',
  wallet_hardware:     'Wallet hardware',
  payment_processing:  'Payment processing',
  treasury_management: 'Treasury management',
  education:           'Education',
  consulting:          'Consulting',
  insurance:           'Insurance',
  lending:             'Lending',
  other:               'Other',
};

export function ProductsView({ products: initialProducts, companies, teamMembers }: ProductsViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [products, setProducts] = useState(initialProducts);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreated = useCallback((product: ProductRow) => {
    setProducts((prev) => [product, ...prev]);
    setShowCreate(false);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-4) var(--space-6) 0' }}>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Add product
        </Button>
      </div>

      <div className={styles.container}>
        {products.length > 0 ? (
          <div className={styles.grid}>
            {products.map((product) => (
              <Link key={product.id} href={`/products/${product.id}`} className={styles.cardLink}>
                <Card hoverable padding="md">
                  <div className={styles.cardTopRow}>
                    <div className={styles.logoWrap}>
                      {product.logo_url ? (
                        <img src={product.logo_url} alt={`${product.name} logo`} />
                      ) : (
                        <Package size={20} strokeWidth={1.5} className={styles.logoPlaceholder} />
                      )}
                    </div>
                    <div className={styles.cardTopInfo}>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>{product.name}</h3>
                      </div>
                      {product.category && (
                        <StatusChip label={categoryLabels[product.category] ?? product.category} color="neutral" />
                      )}
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    {product.companies?.name && (
                      <span>{product.companies.name}</span>
                    )}
                    {product.australian_owned && (
                      <StatusChip label="AU owned" color="neutral" />
                    )}
                    {product.team_members?.full_name && (
                      <span>{product.team_members.full_name}</span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Package size={48} strokeWidth={1} />
            <h3>No products yet</h3>
            <p>Add industry products and services BTS advises clients on.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Add product</Button>
          </div>
        )}
      </div>

      <SlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="product-form" loading={isSubmitting}>Save product</Button>
          </>
        }
      >
        <ProductForm
          companies={companies}
          teamMembers={teamMembers}
          onSuccess={handleCreated}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>
    </>
  );
}
