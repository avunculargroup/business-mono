'use client';

import { createProduct } from '@/app/actions/products';
import { useCurrentUser } from '@/providers/UserProvider';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

type ProductRow = {
  id: string;
  slug: string;
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

interface ProductFormProps {
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (product: ProductRow) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ProductForm({ companies, teamMembers, onSuccess, onPendingChange }: ProductFormProps) {
  const user = useCurrentUser();
  const { state, formAction } = useEntityForm({
    mode: 'create',
    entityLabel: 'Product',
    create: createProduct,
    onSuccess: (result) =>
      onSuccess({ ...(result.product as object), companies: null, team_members: null } as unknown as ProductRow),
    onPendingChange,
  });

  return (
    <form id="product-form" action={formAction} className={styles.form}>
      <input type="hidden" name="created_by" value={user.id} />

      <FormField label="Name" name="name" required />

      <FormField label="Business name" name="business_name" />

      <FormRow>
        <FormSelect label="Category" name="category" defaultValue="">
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
        </FormSelect>
        <FormSelect label="Company" name="company_id" defaultValue="">
          <option value="">None</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FormSelect>
      </FormRow>

      <FormRow>
        <FormSelect label="Key relationship" name="key_relationship_id" defaultValue="">
          <option value="">None</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </FormSelect>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="australian_owned" />
            <span className={styles.label} style={{ marginBottom: 0 }}>Australian owned</span>
          </label>
        </div>
      </FormRow>

      <FormTextarea label="Description" name="description" rows={4} />

      <FormField label="Logo URL" name="logo_url" type="url" placeholder="https://" />

      <FormField label="Product image URL" name="product_image_url" type="url" placeholder="https://" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
