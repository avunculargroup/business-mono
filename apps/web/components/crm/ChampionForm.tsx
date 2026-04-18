'use client';

import { useActionState, useEffect } from 'react';
import { createChampion, updateChampion } from '@/app/actions/champions';
import { useToast } from '@/providers/ToastProvider';
import type { ChampionRow, ContactOption, CompanyOption } from './ChampionsList';
import styles from '@/components/discovery/DiscoveryForm.module.css';

interface ChampionFormProps {
  champion?: ChampionRow;
  contacts: ContactOption[];
  companies: CompanyOption[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ChampionForm({ champion, contacts, companies, onSuccess, onPendingChange }: ChampionFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = champion
      ? await updateChampion(champion.id, formData)
      : await createChampion(formData);

    if (result.error) { error(result.error); return { error: result.error }; }
    success(champion ? 'Champion updated' : 'Champion added');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id="champion-form" action={formAction} className={styles.form}>
      {!champion && (
        <div className={styles.field}>
          <label className={styles.label}>Contact <span className={styles.required}>*</span></label>
          <select name="contact_id" required defaultValue="" className={styles.select}>
            <option value="" disabled>— Select contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Role type <span className={styles.required}>*</span></label>
          <select name="role_type" defaultValue={champion?.role_type ?? 'Champion'} className={styles.select}>
            <option value="Champion">Champion</option>
            <option value="Economic Buyer">Economic Buyer</option>
            <option value="Influencer">Influencer</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Score (1–5)</label>
          <input
            type="number"
            name="champion_score"
            min={1}
            max={5}
            defaultValue={champion?.champion_score ?? 3}
            className={styles.input}
          />
        </div>
      </div>

      {companies.length > 0 && !champion && (
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="company_id" defaultValue="" className={styles.select}>
            <option value="">— Select company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Last contacted</label>
        <input
          type="datetime-local"
          name="last_contacted_at"
          defaultValue={champion?.last_contacted_at ? champion.last_contacted_at.slice(0, 16) : ''}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={champion?.notes ?? ''}
          className={styles.textarea}
          placeholder="Observations, relationship context, internal dynamics…"
        />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
