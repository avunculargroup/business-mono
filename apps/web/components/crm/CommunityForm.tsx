'use client';

import { useActionState, useEffect, useState } from 'react';
import { createCommunityEntry, updateCommunityEntry } from '@/app/actions/community';
import { useToast } from '@/providers/ToastProvider';
import { X } from 'lucide-react';
import type { CommunityRow } from './CommunityWatchlist';
import styles from '@/components/discovery/DiscoveryForm.module.css';

interface CommunityFormProps {
  entry?: CommunityRow;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

function TagInput({ name, initial }: { name: string; initial: string[] }) {
  const [tags, setTags]     = useState<string[]>(initial);
  const [input, setInput]   = useState('');

  const addTag = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) setTags((p) => [...p, v]);
    setInput('');
  };

  return (
    <div>
      <div className={styles.chipArea}>
        {tags.map((t) => (
          <span key={t} className={styles.chip}>
            {t}
            <button type="button" className={styles.chipRemove} onClick={() => setTags((p) => p.filter((x) => x !== t))}>
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          placeholder={tags.length === 0 ? 'Type and press Enter…' : 'Add more…'}
          className={styles.chipInput}
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
    </div>
  );
}

export function CommunityForm({ entry, onSuccess, onPendingChange }: CommunityFormProps) {
  const { success, error } = useToast();
  const [type, setType] = useState(entry?.type ?? 'linkedin_group');

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = entry
      ? await updateCommunityEntry(entry.id, formData)
      : await createCommunityEntry(formData);

    if (result.error) { error(result.error); return { error: result.error }; }
    success(entry ? 'Community updated' : 'Community added');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  return (
    <form id="community-form" action={formAction} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Type <span className={styles.required}>*</span></label>
          <select name="type" defaultValue={entry?.type ?? 'linkedin_group'} className={styles.select} onChange={(e) => setType(e.target.value)}>
            <option value="linkedin_group">LinkedIn Group</option>
            <option value="association">Association</option>
            <option value="conference">Conference</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Engagement status</label>
          <select name="engagement_status" defaultValue={entry?.engagement_status ?? 'not_joined'} className={styles.select}>
            <option value="not_joined">Not joined</option>
            <option value="joined">Joined</option>
            <option value="attended">Attended</option>
            <option value="sponsor">Sponsor</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Name <span className={styles.required}>*</span></label>
        <input type="text" name="name" required defaultValue={entry?.name} className={styles.input} placeholder="e.g. CFO Alliance, FinanceCon 2026" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>URL</label>
        <input type="url" name="url" defaultValue={entry?.url ?? ''} className={styles.input} placeholder="https://…" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea name="description" rows={3} defaultValue={entry?.description ?? ''} className={styles.textarea} placeholder="What is this community about?" />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Membership size</label>
          <input type="number" name="membership_size" min={0} defaultValue={entry?.membership_size ?? ''} className={styles.input} placeholder="Approx. members" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Activity level (1–5)</label>
          <input type="number" name="activity_level" min={1} max={5} defaultValue={entry?.activity_level ?? ''} className={styles.input} placeholder="1 = low, 5 = very active" />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Target roles</label>
        <TagInput name="role_tags" initial={entry?.role_tags ?? []} />
        <span className={styles.hint}>e.g. CFO, HR, CEO</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Industries</label>
        <TagInput name="industry_tags" initial={entry?.industry_tags ?? []} />
        <span className={styles.hint}>e.g. law_firm, technology, finance</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Location</label>
        <input type="text" name="location" defaultValue={entry?.location ?? ''} className={styles.input} placeholder="City, region or 'Online'" />
      </div>

      {type === 'conference' && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Start date</label>
            <input type="date" name="start_date" defaultValue={entry?.start_date ?? ''} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>End date</label>
            <input type="date" name="end_date" defaultValue={entry?.end_date ?? ''} className={styles.input} />
          </div>
        </div>
      )}

      {type === 'conference' && (
        <div className={styles.field}>
          <label className={styles.label}>Timezone</label>
          <input type="text" name="timezone" defaultValue={entry?.timezone ?? ''} className={styles.input} placeholder="e.g. America/Chicago" />
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={3} defaultValue={entry?.notes ?? ''} className={styles.textarea} placeholder="Internal observations, contact notes…" />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
