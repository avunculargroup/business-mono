'use client';

import { useState } from 'react';
import { createCommunityEntry, updateCommunityEntry } from '@/app/actions/community';
import type { CommunityRow } from './CommunityWatchlist';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import { TagInput } from '@/components/ui/TagInput';
import styles from '@/components/ui/Form.module.css';

interface CommunityFormProps {
  entry?: CommunityRow;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function CommunityForm({ entry, onSuccess, onPendingChange }: CommunityFormProps) {
  const [type, setType] = useState(entry?.type ?? 'linkedin_group');

  const { state, formAction } = useEntityForm({
    mode: entry ? 'edit' : 'create',
    entityLabel: 'Community',
    create: createCommunityEntry,
    update: (formData) => updateCommunityEntry(entry!.id, formData),
    onSuccess: () => onSuccess(),
    onPendingChange,
  });

  return (
    <form id="community-form" action={formAction} className={styles.form}>
      <FormRow>
        <FormSelect
          label="Type"
          name="type"
          required
          defaultValue={entry?.type ?? 'linkedin_group'}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="linkedin_group">LinkedIn Group</option>
          <option value="association">Association</option>
          <option value="conference">Conference</option>
        </FormSelect>
        <FormSelect label="Engagement status" name="engagement_status" defaultValue={entry?.engagement_status ?? 'not_joined'}>
          <option value="not_joined">Not joined</option>
          <option value="joined">Joined</option>
          <option value="attended">Attended</option>
          <option value="sponsor">Sponsor</option>
        </FormSelect>
      </FormRow>

      <FormField label="Name" name="name" required defaultValue={entry?.name} placeholder="e.g. CFO Alliance, FinanceCon 2026" />

      <FormField label="URL" name="url" type="url" defaultValue={entry?.url ?? ''} placeholder="https://…" />

      <FormTextarea label="Description" name="description" rows={3} defaultValue={entry?.description ?? ''} placeholder="What is this community about?" />

      <FormRow>
        <FormField label="Membership size" name="membership_size" type="number" min={0} defaultValue={entry?.membership_size ?? ''} placeholder="Approx. members" />
        <FormField label="Activity level (1–5)" name="activity_level" type="number" min={1} max={5} defaultValue={entry?.activity_level ?? ''} placeholder="1 = low, 5 = very active" />
      </FormRow>

      <TagInput name="role_tags" label="Target roles" defaultValue={entry?.role_tags ?? []} hint="e.g. CFO, HR, CEO" />

      <TagInput name="industry_tags" label="Industries" defaultValue={entry?.industry_tags ?? []} hint="e.g. law_firm, technology, finance" />

      <FormField label="Location" name="location" defaultValue={entry?.location ?? ''} placeholder="City, region or 'Online'" />

      {type === 'conference' && (
        <FormRow>
          <FormField label="Start date" name="start_date" type="date" defaultValue={entry?.start_date ?? ''} />
          <FormField label="End date" name="end_date" type="date" defaultValue={entry?.end_date ?? ''} />
        </FormRow>
      )}

      {type === 'conference' && (
        <FormField label="Timezone" name="timezone" defaultValue={entry?.timezone ?? ''} placeholder="e.g. America/Chicago" />
      )}

      <FormTextarea label="Notes" name="notes" rows={3} defaultValue={entry?.notes ?? ''} placeholder="Internal observations, contact notes…" />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
