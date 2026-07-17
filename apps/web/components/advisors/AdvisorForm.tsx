'use client';

import { createAdvisor } from '@/app/actions/advisors';
import { useCurrentUser } from '@/providers/UserProvider';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

type AdvisorRow = {
  id: string;
  slug: string;
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
  const { state, formAction } = useEntityForm({
    mode: 'create',
    entityLabel: 'Advisor',
    create: createAdvisor,
    onSuccess: (result) =>
      onSuccess({ ...(result.advisor as object), companies: null, team_members: null } as unknown as AdvisorRow),
    onPendingChange,
  });

  return (
    <form id="advisor-form" action={formAction} className={styles.form}>
      <input type="hidden" name="created_by" value={user.id} />

      <FormRow>
        <FormField label="Name" name="name" required />
        <FormSelect label="Type" name="type" required defaultValue="">
          <option value="" disabled>Select type</option>
          <option value="advisor">Advisor</option>
          <option value="partner">Partner</option>
        </FormSelect>
      </FormRow>

      <FormField label="Specialization" name="specialization" placeholder="Area of expertise or focus" />

      <FormRow>
        <FormSelect label="Company" name="company_id" defaultValue="">
          <option value="">None</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FormSelect>
        <FormSelect label="Engagement model" name="engagement_model" defaultValue="">
          <option value="">None</option>
          <option value="ongoing_retainer">Ongoing retainer</option>
          <option value="project_based">Project based</option>
          <option value="ad_hoc">Ad hoc</option>
          <option value="revenue_share">Revenue share</option>
          <option value="honorary">Honorary</option>
        </FormSelect>
      </FormRow>

      <FormRow>
        <FormSelect label="Key relationship" name="key_relationship_id" defaultValue="">
          <option value="">None</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </FormSelect>
        <div className={styles.field} style={{ justifyContent: 'flex-end', paddingBottom: 'var(--space-2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input type="checkbox" name="active" defaultChecked />
            <span className={styles.label} style={{ marginBottom: 0 }}>Active</span>
          </label>
        </div>
      </FormRow>

      <FormTextarea label="Bio" name="bio" rows={4} placeholder="Background and experience" />

      <FormField label="Rate notes" name="rate_notes" placeholder="Compensation arrangement" />

      <FormRow>
        <FormField label="Website" name="website" type="url" placeholder="https://" />
        <FormField label="LinkedIn" name="linkedin_url" type="url" placeholder="https://" />
      </FormRow>

      <FormField label="Logo URL" name="logo_url" type="url" placeholder="https://" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
