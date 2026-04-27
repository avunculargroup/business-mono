'use client';

import { useState } from 'react';
import { addAdvisorContact } from '@/app/actions/advisors';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

type AdvisorContact = {
  id: string;
  role: string | null;
  contacts: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

interface AdvisorContactFormProps {
  advisorId: string;
  allContacts: { id: string; first_name: string; last_name: string; email: string | null }[];
  existingContactIds: string[];
  onSuccess: (contact: AdvisorContact) => void;
}

export function AdvisorContactForm({ advisorId, allContacts, existingContactIds, onSuccess }: AdvisorContactFormProps) {
  const { success, error } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const available = allContacts.filter((c) => !existingContactIds.includes(c.id));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const contactId = (form.elements.namedItem('contact_id') as HTMLSelectElement).value;
    const role = (form.elements.namedItem('role') as HTMLInputElement).value;

    if (!contactId) { error('Select a contact'); return; }

    setIsSubmitting(true);
    const result = await addAdvisorContact(advisorId, contactId, role);
    setIsSubmitting(false);

    if ('error' in result) { error(result.error!); return; }

    success('Contact added');
    onSuccess(result.contact as AdvisorContact);
  };

  if (available.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', padding: 'var(--space-4)' }}>
        All contacts are already added.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Contact *</label>
        <select name="contact_id" required className={styles.select} defaultValue="">
          <option value="">Select a contact</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}{c.email ? ` — ${c.email}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Role</label>
        <input name="role" className={styles.input} placeholder="e.g. primary, admin" />
      </div>

      <Button variant="primary" type="submit" loading={isSubmitting}>Add contact</Button>
    </form>
  );
}
