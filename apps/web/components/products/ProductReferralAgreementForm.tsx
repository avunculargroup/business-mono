'use client';

import { useActionState, useEffect } from 'react';
import { createReferralAgreement } from '@/app/actions/products';
import { useToast } from '@platform/ui/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

type Agreement = {
  id: string;
  agreement_type: string | null;
  counterparty_name: string | null;
  fee_structure: string | null;
  percentage: number | null;
  active: boolean;
  notes: string | null;
};

interface ProductReferralAgreementFormProps {
  productId: string;
  onSuccess: (agreement: Agreement) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ProductReferralAgreementForm({ productId, onSuccess, onPendingChange }: ProductReferralAgreementFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createReferralAgreement(formData);
    if ('error' in result) {
      error(result.error!);
      return { error: result.error! };
    }
    success('Agreement added');
    onSuccess(result.agreement as Agreement);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="referral-agreement-form" action={formAction} className={styles.form}>
      <input type="hidden" name="product_service_id" value={productId} />

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Agreement type</span>
          <select name="agreement_type" defaultValue="" className={styles.select}>
            <option value="">None</option>
            <option value="referral_fee">Referral fee</option>
            <option value="revenue_share">Revenue share</option>
            <option value="affiliate">Affiliate</option>
            <option value="strategic">Strategic</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Counterparty</span>
          <input name="counterparty_name" className={styles.input} placeholder="Who is this with?" />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Fee structure</span>
        <input name="fee_structure" className={styles.input} placeholder="Describe the fee arrangement" />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Percentage (%)</span>
          <input name="percentage" type="number" step="0.01" min="0" max="100" className={styles.input} placeholder="e.g. 2.5" />
        </label>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="active" defaultChecked />
            <span className={styles.label} style={{ textTransform: 'none', letterSpacing: 'normal', marginBottom: 0 }}>Active</span>
          </label>
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Notes</span>
        <textarea name="notes" rows={3} className={styles.textarea} />
      </label>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
