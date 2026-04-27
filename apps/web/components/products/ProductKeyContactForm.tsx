'use client';

import { useState } from 'react';
import { addProductKeyContact } from '@/app/actions/products';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

type KeyContact = {
  id: string;
  role: string | null;
  contacts: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

interface ProductKeyContactFormProps {
  productId: string;
  allContacts: { id: string; first_name: string; last_name: string; email: string | null }[];
  existingContactIds: string[];
  onSuccess: (kc: KeyContact) => void;
}

export function ProductKeyContactForm({ productId, allContacts, existingContactIds, onSuccess }: ProductKeyContactFormProps) {
  const { success, error } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const available = allContacts.filter((c) => !existingContactIds.includes(c.id));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const contactId = (form.elements.namedItem('contact_id') as HTMLSelectElement).value;
    const role = (form.elements.namedItem('role') as HTMLSelectElement).value;

    if (!contactId) { error('Select a contact'); return; }

    setIsSubmitting(true);
    const result = await addProductKeyContact(productId, contactId, role);
    setIsSubmitting(false);

    if ('error' in result) { error(result.error!); return; }

    success('Contact added');
    onSuccess(result.keyContact as KeyContact);
  };

  if (available.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', padding: 'var(--space-4)' }}>
        All contacts are already added as key contacts.
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
        <select name="role" className={styles.select} defaultValue="">
          <option value="">None</option>
          <option value="primary">Primary</option>
          <option value="technical">Technical</option>
          <option value="sales">Sales</option>
          <option value="support">Support</option>
          <option value="other">Other</option>
        </select>
      </div>

      <Button variant="primary" type="submit" loading={isSubmitting}>Add contact</Button>
    </form>
  );
}
