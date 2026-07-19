'use client';

import { createCompany, updateCompany } from '@/app/actions/companies';
import { Button } from '@/components/ui/Button';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  created_at: string;
  // Optional fields for edit pre-population
  linkedin_url?: string | null;
  notes?: string | null;
};

interface CompanyFormProps {
  onSuccess: (company?: CompanyRow) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: CompanyRow;
}

export function CompanyForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: CompanyFormProps) {
  const { state, formAction, isPending } = useEntityForm({
    mode,
    entityLabel: 'Company',
    create: createCompany,
    update: (formData) => updateCompany(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.company as CompanyRow | undefined),
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
        defaultValue={defaultValues?.linkedin_url ?? ''}
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
