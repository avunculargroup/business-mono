'use client';

import type { CompanySummary } from '@platform/data';
import { createCompany, updateCompany } from '@/app/actions/companies';
import { Button } from '@platform/ui/Button';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@platform/ui/FormField';
import styles from '@platform/ui/Form.module.css';

interface CompanyFormProps {
  onSuccess: (company?: CompanySummary) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: CompanySummary;
}

export function CompanyForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: CompanyFormProps) {
  const { state, formAction, isPending } = useEntityForm({
    mode,
    entityLabel: 'Company',
    create: createCompany,
    update: (formData) => updateCompany(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.company as CompanySummary | undefined),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'company-edit-form' : 'company-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormField label="Name" name="name" required defaultValue={defaultValues?.name ?? ''} />

      <FormRow>
        <FormField label="Industry" name="industry" defaultValue={defaultValues?.industry ?? ''} />
        <FormSelect label="Size" name="size" defaultValue={defaultValues?.size ?? ''}>
          <option value="">Select</option>
          <option value="SME">SME</option>
          <option value="Mid-market">Mid-market</option>
          <option value="Enterprise">Enterprise</option>
        </FormSelect>
      </FormRow>

      <FormField label="Website" name="website" type="url" placeholder="https://" defaultValue={defaultValues?.website ?? ''} />

      <FormField
        label="LinkedIn URL"
        name="linkedin_url"
        type="url"
        placeholder="https://linkedin.com/company/..."
        defaultValue={defaultValues?.linkedinUrl ?? ''}
      />

      <FormTextarea label="Notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ''} />

      {state?.error && <FormError>{state.error}</FormError>}

      {mode !== 'edit' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="primary" type="submit" loading={isPending}>
            Save company
          </Button>
        </div>
      )}
    </form>
  );
}
