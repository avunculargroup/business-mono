'use client';

import { createLexiconEntry, updateLexiconEntry } from '@/app/actions/lexicon';
import type { LexiconRow } from './LexiconList';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

interface LexiconFormProps {
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: LexiconRow;
}

export function LexiconForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: LexiconFormProps) {
  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Entry',
    create: createLexiconEntry,
    update: (formData) => updateLexiconEntry(defaultValues!.id, formData),
    onSuccess: () => onSuccess(),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'lexicon-edit-form' : 'lexicon-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormField label="Internal term" name="term" required defaultValue={defaultValues?.term ?? ''} placeholder="e.g. Moon" />

      <FormField
        label="Professional equivalent"
        name="professional_term"
        required
        defaultValue={defaultValues?.professional_term ?? ''}
        placeholder="e.g. Programmable scarcity"
      />

      <FormField label="Category" name="category" defaultValue={defaultValues?.category ?? ''} placeholder="e.g. Finance, Operations, Communications" />

      <FormTextarea label="Definition" name="definition" rows={3} defaultValue={defaultValues?.definition ?? ''} placeholder="A concise definition of the term…" />

      <FormTextarea label="Example usage" name="example_usage" rows={3} defaultValue={defaultValues?.example_usage ?? ''} placeholder="An example sentence demonstrating correct usage…" />

      <FormSelect label="Status" name="status" defaultValue={defaultValues?.status ?? 'draft'}>
        <option value="draft">Draft</option>
        <option value="approved">Approved</option>
        <option value="deprecated">Deprecated</option>
      </FormSelect>

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
