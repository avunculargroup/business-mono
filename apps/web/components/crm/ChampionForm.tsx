'use client';

import { createChampion, updateChampion } from '@/app/actions/champions';
import type { ChampionRow, ContactOption, CompanyOption } from './ChampionsList';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

interface ChampionFormProps {
  champion?: ChampionRow;
  contacts: ContactOption[];
  companies: CompanyOption[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ChampionForm({ champion, contacts, companies, onSuccess, onPendingChange }: ChampionFormProps) {
  const { state, formAction } = useEntityForm({
    mode: champion ? 'edit' : 'create',
    entityLabel: 'Champion',
    create: createChampion,
    update: (formData) => updateChampion(champion!.id, formData),
    onSuccess: () => onSuccess(),
    onPendingChange,
  });

  return (
    <form id="champion-form" action={formAction} className={styles.form}>
      {!champion && (
        <FormSelect label="Contact" name="contact_id" required defaultValue="">
          <option value="" disabled>— Select contact —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </FormSelect>
      )}

      <FormRow>
        <FormSelect label="Role type" name="role_type" required defaultValue={champion?.role_type ?? 'Champion'}>
          <option value="Champion">Champion</option>
          <option value="Economic Buyer">Economic Buyer</option>
          <option value="Influencer">Influencer</option>
        </FormSelect>
        <FormField label="Score (1–5)" name="champion_score" type="number" min={1} max={5} defaultValue={champion?.champion_score ?? 3} />
      </FormRow>

      {companies.length > 0 && !champion && (
        <FormSelect label="Company" name="company_id" defaultValue="">
          <option value="">— Select company —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FormSelect>
      )}

      <FormField
        label="Last contacted"
        name="last_contacted_at"
        type="datetime-local"
        defaultValue={champion?.last_contacted_at ? champion.last_contacted_at.slice(0, 16) : ''}
      />

      <FormTextarea
        label="Notes"
        name="notes"
        rows={4}
        defaultValue={champion?.notes ?? ''}
        placeholder="Observations, relationship context, internal dynamics…"
      />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
