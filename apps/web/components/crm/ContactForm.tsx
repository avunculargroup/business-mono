'use client';

import { useActionState } from 'react';
import { createContact } from '@/app/actions/contacts';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from './ContactForm.module.css';

interface ContactFormProps {
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: () => void;
}

export function ContactForm({ companies, teamMembers, onSuccess }: ContactFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createContact(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Contact created');
    onSuccess();
    return null;
  };

  const [state, formAction] = useActionState(handleSubmit, null);

  return (
    <form id="contact-form" action={formAction} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>First name *</label>
          <input name="first_name" required className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Last name *</label>
          <input name="last_name" required className={styles.input} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <input name="email" type="email" className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Phone</label>
          <input name="phone" type="tel" className={styles.input} />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Company</label>
        <select name="company_id" className={styles.select}>
          <option value="">None</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Pipeline stage</label>
          <select name="pipeline_stage" defaultValue="lead" className={styles.select}>
            <option value="lead">Lead</option>
            <option value="warm">Warm</option>
            <option value="active">Active</option>
            <option value="client">Client</option>
            <option value="dormant">Dormant</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Bitcoin literacy</label>
          <select name="bitcoin_literacy" defaultValue="unknown" className={styles.select}>
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
        <select name="owner_id" defaultValue={user.id} className={styles.select}>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={3} className={styles.textarea} />
      </div>

      <input type="hidden" name="source" value="manual" />

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
