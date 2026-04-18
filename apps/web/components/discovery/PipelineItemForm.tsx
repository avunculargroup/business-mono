'use client';

import { useActionState, useEffect, useState } from 'react';
import { createPipelineItem, updatePipelineItem, overrideValidation } from '@/app/actions/pipeline';
import { useToast } from '@/providers/ToastProvider';
import { X, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import type { PipelineItemRow, PainPointOption, TeamMember } from './PipelineBoard';
import { INSIGHT_PIPELINE_STAGE_LABELS } from '@platform/shared';
import styles from './DiscoveryForm.module.css';

interface PipelineItemFormProps {
  painPoints: PainPointOption[];
  teamMembers: TeamMember[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: PipelineItemRow;
}

type ResearchLink = { url: string; title: string; note?: string };

export function PipelineItemForm({
  painPoints,
  teamMembers,
  onSuccess,
  onPendingChange,
  mode = 'create',
  defaultValues,
}: PipelineItemFormProps) {
  const { success, error } = useToast();

  const [tags, setTags]               = useState<string[]>(defaultValues?.topic_tags ?? []);
  const [tagInput, setTagInput]       = useState('');
  const [links, setLinks]             = useState<ResearchLink[]>(defaultValues?.research_links ?? []);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding]     = useState(false);

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags((p) => [...p, v]);
    setTagInput('');
  };

  const addLink = () => setLinks((p) => [...p, { url: '', title: '' }]);
  const removeLink = (i: number) => setLinks((p) => p.filter((_, idx) => idx !== i));
  const updateLink = (i: number, field: keyof ResearchLink, value: string) => {
    setLinks((p) => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    formData.set('topic_tags',     JSON.stringify(tags));
    formData.set('research_links', JSON.stringify(links.filter((l) => l.url.trim())));

    if (mode === 'edit' && defaultValues) {
      const result = await updatePipelineItem(defaultValues.id, formData);
      if (result.error) { error(result.error); return { error: result.error }; }
      success('Idea updated');
      onSuccess();
      return null;
    }

    const result = await createPipelineItem(formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Idea created');
    onSuccess();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'pipeline-edit-form' : 'pipeline-form';

  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  const handleOverride = async () => {
    if (!defaultValues || !overrideReason.trim()) return;
    setIsOverriding(true);
    const result = await overrideValidation(defaultValues.id, !defaultValues.validated, overrideReason);
    setIsOverriding(false);
    if (result.error) { error(result.error); } else {
      success(`Validation ${defaultValues.validated ? 'removed' : 'overridden'}`);
      setShowOverride(false);
      onSuccess();
    }
  };

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label}>Title <span className={styles.required}>*</span></label>
        <input
          type="text"
          name="title"
          required
          defaultValue={defaultValues?.title ?? ''}
          className={styles.input}
          placeholder="e.g. Why CFOs miss Bitcoin's scarcity proof"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Outline / description</label>
        <textarea
          name="body"
          rows={4}
          defaultValue={defaultValues?.body ?? ''}
          className={styles.textarea}
          placeholder="What angle will this piece take?"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Stage</label>
          <select name="status" defaultValue={defaultValues?.status ?? 'idea'} className={styles.select}>
            {Object.entries(INSIGHT_PIPELINE_STAGE_LABELS)
              .filter(([s]) => s !== 'archived')
              .map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Score (0–100)</label>
          <input
            type="number"
            name="score"
            min={0}
            max={100}
            defaultValue={defaultValues?.score ?? ''}
            className={styles.input}
            placeholder="Optional priority score"
          />
        </div>
      </div>

      {painPoints.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Pain point</label>
          <select name="pain_point_id" defaultValue={defaultValues?.pain_point_id ?? ''} className={styles.select}>
            <option value="">— Link to pain point —</option>
            {painPoints.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.content.slice(0, 70)}{pp.content.length > 70 ? '…' : ''}
              </option>
            ))}
          </select>
          {/* Validation status — only shown in edit mode when a pain point is linked */}
          {mode === 'edit' && defaultValues?.pain_point_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              {defaultValues.validated ? (
                <CheckCircle size={14} strokeWidth={2} style={{ color: 'var(--color-success, #22c55e)' }} />
              ) : (
                <AlertCircle size={14} strokeWidth={2} style={{ color: 'var(--color-text-tertiary)' }} />
              )}
              <span className={styles.hint} style={{ margin: 0 }}>
                {defaultValues.validated
                  ? `Validated — mentioned in ${defaultValues.question_count} interview${defaultValues.question_count !== 1 ? 's' : ''}`
                  : `Not validated — mentioned in ${defaultValues.question_count} interview${defaultValues.question_count !== 1 ? 's' : ''} (need 3+)`
                }
              </span>
              <button
                type="button"
                className={styles.addLinkBtn}
                style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
                onClick={() => setShowOverride((v) => !v)}
              >
                Override
              </button>
            </div>
          )}
          {showOverride && mode === 'edit' && defaultValues && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                className={styles.input}
                placeholder="Reason for override (required)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className={styles.addLinkBtn} onClick={() => setShowOverride(false)} style={{ padding: '3px 8px' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.addLinkBtn}
                  onClick={handleOverride}
                  disabled={!overrideReason.trim() || isOverriding}
                  style={{ padding: '3px 8px', borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                >
                  {isOverriding ? 'Saving…' : `Set to ${defaultValues.validated ? 'not validated' : 'validated'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Publish date</label>
          <input
            type="date"
            name="scheduled_for"
            defaultValue={defaultValues?.scheduled_for ? defaultValues.scheduled_for.split('T')[0] : ''}
            className={styles.input}
          />
        </div>
        {teamMembers.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label}>Owner</label>
            <select name="assigned_to" defaultValue={defaultValues?.assigned_to ?? ''} className={styles.select}>
              <option value="">— Assign —</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Tags</label>
        <div className={styles.chipArea}>
          {tags.map((tag) => (
            <span key={tag} className={styles.chip}>
              {tag}
              <button type="button" className={styles.chipRemove} onClick={() => setTags((p) => p.filter((t) => t !== tag))}>
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
            placeholder={tags.length === 0 ? 'Add tags…' : 'Add another…'}
            className={styles.chipInput}
          />
        </div>
        <input type="hidden" name="topic_tags" value={JSON.stringify(tags)} />
        <span className={styles.hint}>Press Enter or comma to add tags</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Research links</label>
        {links.map((link, i) => (
          <div key={i} className={styles.linkRow}>
            <input
              type="url"
              value={link.url}
              onChange={(e) => updateLink(i, 'url', e.target.value)}
              placeholder="https://…"
              className={styles.input}
            />
            <input
              type="text"
              value={link.title}
              onChange={(e) => updateLink(i, 'title', e.target.value)}
              placeholder="Title"
              className={styles.input}
            />
            <button type="button" className={styles.removeBtn} onClick={() => removeLink(i)}>
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
        <button type="button" className={styles.addLinkBtn} onClick={addLink}>
          <Plus size={14} strokeWidth={2} /> Add link
        </button>
        <input type="hidden" name="research_links" value={JSON.stringify(links)} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
