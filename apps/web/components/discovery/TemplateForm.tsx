'use client';

import { createTemplate, updateTemplate } from '@/app/actions/templates';
import type { TemplateRow } from './TemplatesList';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import { TagInput } from '@/components/ui/TagInput';
import styles from '@/components/ui/Form.module.css';

interface TemplateFormProps {
  onSuccess: (id?: string) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: TemplateRow;
}

export function TemplateForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: TemplateFormProps) {
  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Template',
    create: createTemplate,
    update: (formData) => updateTemplate(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess((result.template as { id: string } | undefined)?.id),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'template-edit-form' : 'template-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormSelect label="Type" name="type" required defaultValue={defaultValues?.type ?? 'one_pager'} disabled={mode === 'edit'}>
        <option value="one_pager">One-pager</option>
        <option value="briefing_deck">Briefing deck</option>
      </FormSelect>

      <FormField label="Title" name="title" required defaultValue={defaultValues?.title ?? ''} placeholder="e.g. Treasury Risk One-pager" />

      <FormTextarea label="Description" name="description" rows={3} defaultValue={defaultValues?.description ?? ''} placeholder="Short description of when to use this template…" />

      <TagInput
        name="tags"
        label="Tags"
        defaultValue={defaultValues?.tags ?? []}
        placeholder="Add tags…"
        hint="Press Enter or comma to add tags"
        transform={(s) => s.trim().toLowerCase()}
      />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
