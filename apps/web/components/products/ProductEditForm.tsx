'use client';

import { useActionState, useEffect } from 'react';
import { updateProduct } from '@/app/actions/products';
import { useToast } from '@platform/ui/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

type Product = {
  id: string;
  name: string;
  business_name: string | null;
  category: string | null;
  australian_owned: boolean;
  description: string | null;
  logo_url: string | null;
  product_image_url: string | null;
  company_id: string | null;
  key_relationship_id: string | null;
};

interface ProductEditFormProps {
  product: Product;
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ProductEditForm({ product, companies, teamMembers, onSuccess, onPendingChange }: ProductEditFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await updateProduct(product.id, formData);
    if ('error' in result) {
      error(result.error!);
      return { error: result.error! };
    }
    success('Product updated');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="product-edit-form" action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Name *</span>
        <input name="name" required defaultValue={product.name} className={styles.input} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Business name</span>
        <input name="business_name" defaultValue={product.business_name ?? ''} className={styles.input} />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Category</span>
          <select name="category" defaultValue={product.category ?? ''} className={styles.select}>
            <option value="">None</option>
            <option value="custody">Custody</option>
            <option value="exchange">Exchange</option>
            <option value="wallet_software">Wallet software</option>
            <option value="wallet_hardware">Wallet hardware</option>
            <option value="payment_processing">Payment processing</option>
            <option value="treasury_management">Treasury management</option>
            <option value="education">Education</option>
            <option value="consulting">Consulting</option>
            <option value="insurance">Insurance</option>
            <option value="lending">Lending</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Company</span>
          <select name="company_id" defaultValue={product.company_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Key relationship</span>
          <select name="key_relationship_id" defaultValue={product.key_relationship_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="australian_owned" defaultChecked={product.australian_owned} />
            <span className={styles.label} style={{ textTransform: 'none', letterSpacing: 'normal', marginBottom: 0 }}>Australian owned</span>
          </label>
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea name="description" rows={4} defaultValue={product.description ?? ''} className={styles.textarea} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Logo URL</span>
        <input name="logo_url" type="url" defaultValue={product.logo_url ?? ''} className={styles.input} placeholder="https://" />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Product image URL</span>
        <input name="product_image_url" type="url" defaultValue={product.product_image_url ?? ''} className={styles.input} placeholder="https://" />
      </label>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
