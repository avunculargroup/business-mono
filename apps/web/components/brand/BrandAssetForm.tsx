'use client';

import { useActionState } from 'react';
import { createBrandAsset } from '@/app/actions/brand';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

interface BrandAssetFormProps {
  onSuccess: () => void;
}

export function BrandAssetForm({ onSuccess }: BrandAssetFormProps) {
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

  const [state, formAction] = useActionState(handleSubmit, null);

  return (
    <form id="brand-asset-form" action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Name *</label>
        <input name="name" required className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Type *</label>
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
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea name="description" rows={2} className={styles.textarea} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Content</label>
        <textarea name="content" rows={5} className={styles.textarea} placeholder="Paste text content, colour codes, guidelines, etc." />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
