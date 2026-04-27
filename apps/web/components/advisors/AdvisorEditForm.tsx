'use client';

import { useActionState, useEffect } from 'react';
import { updateAdvisor } from '@/app/actions/advisors';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/components/crm/ContactForm.module.css';

type Advisor = {
  id: string;
  name: string;
  type: 'advisor' | 'partner';
  specialization: string | null;
  engagement_model: string | null;
  rate_notes: string | null;
  bio: string | null;
  logo_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  active: boolean;
  company_id: string | null;
  key_relationship_id: string | null;
};

interface AdvisorEditFormProps {
  advisor: Advisor;
  companies: { id: string; name: string }[];
  teamMembers: { id: string; full_name: string }[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function AdvisorEditForm({ advisor, companies, teamMembers, onSuccess, onPendingChange }: AdvisorEditFormProps) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await updateAdvisor(advisor.id, formData);
    if ('error' in result) {
      error(result.error!);
      return { error: result.error! };
    }
    success('Updated');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id="advisor-edit-form" action={formAction} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Name *</label>
          <input name="name" required defaultValue={advisor.name} className={styles.input} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Type *</label>
          <select name="type" required defaultValue={advisor.type} className={styles.select}>
            <option value="advisor">Advisor</option>
            <option value="partner">Partner</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Specialization</label>
        <input name="specialization" defaultValue={advisor.specialization ?? ''} className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="company_id" defaultValue={advisor.company_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Engagement model</label>
          <select name="engagement_model" defaultValue={advisor.engagement_model ?? ''} className={styles.select}>
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
          <select name="key_relationship_id" defaultValue={advisor.key_relationship_id ?? ''} className={styles.select}>
            <option value="">None</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="active" defaultChecked={advisor.active} />
            <span className={styles.label} style={{ textTransform: 'none', letterSpacing: 'normal', marginBottom: 0 }}>Active</span>
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Bio</label>
        <textarea name="bio" rows={4} defaultValue={advisor.bio ?? ''} className={styles.textarea} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Rate notes</label>
        <input name="rate_notes" defaultValue={advisor.rate_notes ?? ''} className={styles.input} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Website</label>
          <input name="website" type="url" defaultValue={advisor.website ?? ''} className={styles.input} placeholder="https://" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>LinkedIn</label>
          <input name="linkedin_url" type="url" defaultValue={advisor.linkedin_url ?? ''} className={styles.input} placeholder="https://" />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Logo URL</label>
        <input name="logo_url" type="url" defaultValue={advisor.logo_url ?? ''} className={styles.input} placeholder="https://" />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
