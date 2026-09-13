'use client';

import { useActionState, useEffect } from 'react';
import { createBrandAsset } from '@/app/actions/brand';
import { useToast } from '@platform/ui/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface BrandAssetFormProps {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function BrandAssetForm({ onSuccess, onPendingChange }: BrandAssetFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createBrandAsset(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Asset added');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="brand-asset-form" action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Name *</span>
        <input name="name" required className={styles.input} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Type *</span>
        <select name="type" defaultValue="other" className={styles.select}>
          <option value="logo">Logo</option>
          <option value="colour_palette">Colour palette</option>
          <option value="typography">Typography</option>
          <option value="tone_of_voice">Tone of voice</option>
          <option value="style_guide">Style guide</option>
          <option value="template">Template</option>
          <option value="image">Image</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea name="description" rows={2} className={styles.textarea} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Content</span>
        <textarea name="content" rows={5} className={styles.textarea} placeholder="Paste text content, colour codes, guidelines, etc." />
      </label>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
