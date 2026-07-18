'use client';

import { createContact, updateContact } from '@/app/actions/contacts';
import { useCurrentUser } from '@/providers/UserProvider';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import { PIPELINE_STAGE_LABELS } from '@platform/shared';
import styles from '@/components/ui/Form.module.css';

type ContactRow = {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  email: string | null;
  pipeline_stage: string;
  owner_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  // Optional fields available from detail view but not list view
  phone?: string | null;
  bitcoin_literacy?: string;
  notes?: string | null;
};

interface ContactFormProps {
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (contact?: ContactRow) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: ContactRow;
}

export function ContactForm({ companies, teamMembers, onSuccess, onPendingChange, mode = 'create', defaultValues }: ContactFormProps) {
  const user = useCurrentUser();
  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Contact',
    create: createContact,
    update: (formData) => updateContact(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.contact as ContactRow | undefined),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'contact-edit-form' : 'contact-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <FormRow>
        <FormField label="First name" name="first_name" required defaultValue={defaultValues?.first_name ?? ''} />
        <FormField label="Last name" name="last_name" required defaultValue={defaultValues?.last_name ?? ''} />
      </FormRow>

      <FormRow>
        <FormField label="Email" name="email" type="email" defaultValue={defaultValues?.email ?? ''} />
        <FormField label="Phone" name="phone" type="tel" defaultValue={defaultValues?.phone ?? ''} />
      </FormRow>

      <FormSelect label="Company" name="company_id" defaultValue={defaultValues?.company_id ?? ''}>
        <option value="">None</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </FormSelect>

      <FormRow>
        <FormSelect label="Pipeline stage" name="pipeline_stage" defaultValue={defaultValues?.pipeline_stage ?? 'lead'}>
          {Object.entries(PIPELINE_STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </FormSelect>
        <FormSelect label="Bitcoin literacy" name="bitcoin_literacy" defaultValue={defaultValues?.bitcoin_literacy ?? 'unknown'}>
          <option value="unknown">Unknown</option>
          <option value="none">None</option>
          <option value="basic">Basic</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </FormSelect>
      </FormRow>

      <FormSelect label="Owner" name="owner_id" defaultValue={defaultValues?.owner_id ?? user.id}>
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>{m.full_name}</option>
        ))}
      </FormSelect>

      <FormTextarea label="Notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ''} />

      <input type="hidden" name="source" value="manual" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
