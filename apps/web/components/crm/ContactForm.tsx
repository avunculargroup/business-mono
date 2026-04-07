'use client';

import { useActionState } from 'react';
import { createContact, updateContact } from '@/app/actions/contacts';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from './ContactForm.module.css';

type ContactRow = {
  id: string;
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
  mode?: 'create' | 'edit';
  defaultValues?: ContactRow;
}

export function ContactForm({ companies, teamMembers, onSuccess, mode = 'create', defaultValues }: ContactFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updateContact(defaultValues.id, formData);
      if (result.error) {
        error(result.error);
        return { error: result.error };
      }
      success('Contact updated');
      onSuccess();
      return null;
    }

    const result = await createContact(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Contact created');
    onSuccess(result.contact as ContactRow);
    return null;
  };

  const [state, formAction] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'contact-edit-form' : 'contact-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>First name *</label>
          <input name="first_name" required defaultValue={defaultValues?.first_name ?? ''} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Last name *</label>
          <input name="last_name" required defaultValue={defaultValues?.last_name ?? ''} className={styles.input} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <input name="email" type="email" defaultValue={defaultValues?.email ?? ''} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Phone</label>
          <input name="phone" type="tel" defaultValue={defaultValues?.phone ?? ''} className={styles.input} />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Company</label>
        <select name="company_id" defaultValue={defaultValues?.company_id ?? ''} className={styles.select}>
          <option value="">None</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Pipeline stage</label>
          <select name="pipeline_stage" defaultValue={defaultValues?.pipeline_stage ?? 'lead'} className={styles.select}>
            <option value="lead">Lead</option>
            <option value="warm">Warm</option>
            <option value="active">Active</option>
            <option value="client">Client</option>
            <option value="dormant">Dormant</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Bitcoin literacy</label>
          <select name="bitcoin_literacy" defaultValue={defaultValues?.bitcoin_literacy ?? 'unknown'} className={styles.select}>
            <option value="unknown">Unknown</option>
            <option value="none">None</option>
            <option value="basic">Basic</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Owner</label>
        <select name="owner_id" defaultValue={defaultValues?.owner_id ?? user.id} className={styles.select}>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={3} defaultValue={defaultValues?.notes ?? ''} className={styles.textarea} />
      </div>

      <input type="hidden" name="source" value="manual" />

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
