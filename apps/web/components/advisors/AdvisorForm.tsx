'use client';

import { useActionState, useEffect } from 'react';
import { createAdvisor } from '@/app/actions/advisors';
import { useToast } from '@/providers/ToastProvider';
import { useCurrentUser } from '@/providers/UserProvider';
import styles from '@/components/crm/ContactForm.module.css';

type AdvisorRow = {
  id: string;
  name: string;
  type: 'advisor' | 'partner';
  specialization: string | null;
  active: boolean;
  logo_url: string | null;
  company_id: string | null;
  key_relationship_id: string | null;
  companies: { name: string } | null;
  team_members: { full_name: string } | null;
};

interface AdvisorFormProps {
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: (advisor: AdvisorRow) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function AdvisorForm({ companies, teamMembers, onSuccess, onPendingChange }: AdvisorFormProps) {
  const user = useCurrentUser();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await createAdvisor(formData);
    if ('error' in result) {
      error(result.error!);
      return { error: result.error! };
    }
    success('Advisor added');
    onSuccess(result.advisor as AdvisorRow);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="advisor-form" action={formAction} className={styles.form}>
      <input type="hidden" name="created_by" value={user.id} />

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Name *</label>
          <input name="name" required className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Type *</label>
          <select name="type" required defaultValue="" className={styles.select}>
            <option value="" disabled>Select type</option>
            <option value="advisor">Advisor</option>
            <option value="partner">Partner</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Specialization</label>
        <input name="specialization" className={styles.input} placeholder="Area of expertise or focus" />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="company_id" defaultValue="" className={styles.select}>
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Engagement model</label>
          <select name="engagement_model" defaultValue="" className={styles.select}>
            <option value="">None</option>
            <option value="ongoing_retainer">Ongoing retainer</option>
            <option value="project_based">Project based</option>
            <option value="ad_hoc">Ad hoc</option>
            <option value="revenue_share">Revenue share</option>
            <option value="honorary">Honorary</option>
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Key relationship</label>
          <select name="key_relationship_id" defaultValue="" className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="active" defaultChecked />
            <span className={styles.label} style={{ textTransform: 'none', letterSpacing: 'normal', marginBottom: 0 }}>Active</span>
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Bio</label>
        <textarea name="bio" rows={4} className={styles.textarea} placeholder="Background and experience" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Rate notes</label>
        <input name="rate_notes" className={styles.input} placeholder="Compensation arrangement" />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Website</label>
          <input name="website" type="url" className={styles.input} placeholder="https://" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>LinkedIn</label>
          <input name="linkedin_url" type="url" className={styles.input} placeholder="https://" />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Logo URL</label>
        <input name="logo_url" type="url" className={styles.input} placeholder="https://" />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
