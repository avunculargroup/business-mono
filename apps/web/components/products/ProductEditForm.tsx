'use client';

import { useActionState, useEffect } from 'react';
import { updateProduct } from '@/app/actions/products';
import { useToast } from '@/providers/ToastProvider';
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
      <div className={styles.field}>
        <label className={styles.label}>Name *</label>
        <input name="name" required defaultValue={product.name} className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Business name</label>
        <input name="business_name" defaultValue={product.business_name ?? ''} className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
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
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="company_id" defaultValue={product.company_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Key relationship</label>
          <select name="key_relationship_id" defaultValue={product.key_relationship_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="australian_owned" defaultChecked={product.australian_owned} />
            <span className={styles.label} style={{ textTransform: 'none', letterSpacing: 'normal', marginBottom: 0 }}>Australian owned</span>
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea name="description" rows={4} defaultValue={product.description ?? ''} className={styles.textarea} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Logo URL</label>
        <input name="logo_url" type="url" defaultValue={product.logo_url ?? ''} className={styles.input} placeholder="https://" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Product image URL</label>
        <input name="product_image_url" type="url" defaultValue={product.product_image_url ?? ''} className={styles.input} placeholder="https://" />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
