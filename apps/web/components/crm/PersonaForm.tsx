'use client';

import { useActionState, useEffect } from 'react';
import { createPersona, updatePersona } from '@/app/actions/personas';
import { useToast } from '@/providers/ToastProvider';
import type { Persona } from '@platform/shared';
import styles from './PersonaForm.module.css';

interface PersonaFormProps {
  onSuccess: (persona?: Persona) => void;
  onPendingChange?: (pending: boolean) => void;
  mode?: 'create' | 'edit';
  defaultValues?: Persona;
}

function joinLines(arr?: string[] | null): string {
  return arr?.join('\n') ?? '';
}

export function PersonaForm({ onSuccess, onPendingChange, mode = 'create', defaultValues }: PersonaFormProps) {
  const { success, error } = useToast();
  const pp = defaultValues?.psychographic_profile;
  const sc = defaultValues?.strategic_constraints;
  const ss = defaultValues?.success_signals;

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    if (mode === 'edit' && defaultValues) {
      const result = await updatePersona(defaultValues.id, formData);
      if (result.error) {
        error(result.error);
        return { error: result.error };
      }
      success('Persona updated');
      onSuccess();
      return null;
    }

    const result = await createPersona(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Persona created');
    onSuccess(result.persona as Persona);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  const formId = mode === 'edit' ? 'persona-edit-form' : 'persona-form';

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return (
    <form id={formId} action={formAction} className={styles.form}>

      <p className={styles.sectionHeading}>Identity</p>

      <div className={styles.field}>
        <label className={styles.label}>Internal name *</label>
        <input name="name" required defaultValue={defaultValues?.name ?? ''} className={styles.input} placeholder="e.g. Skeptical Treasurer" />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Market segment *</label>
          <select name="market_segment" defaultValue={defaultValues?.market_segment ?? ''} className={styles.select} required>
            <option value="">Select…</option>
            <option value="sme">SME</option>
            <option value="public_company">Public Company</option>
            <option value="family_office">Family Office</option>
            <option value="hnw">HNW Individual</option>
            <option value="startup">Startup</option>
            <option value="superannuation">Superannuation</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Bitcoin sophistication</label>
          <select name="sophistication_level" defaultValue={defaultValues?.sophistication_level ?? 'intermediate'} className={styles.select}>
            <option value="novice">Novice</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Estimated AUM / treasury size</label>
        <input name="estimated_aum" defaultValue={defaultValues?.estimated_aum ?? ''} className={styles.input} placeholder="e.g. $50M–$500M" />
      </div>

      <p className={styles.sectionHeading}>Psychographic profile</p>

      <div className={styles.field}>
        <label className={styles.label}>North star</label>
        <input name="north_star" defaultValue={pp?.north_star ?? ''} className={styles.input} placeholder="The single biggest win they want" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Anti-goal</label>
        <input name="anti_goal" defaultValue={pp?.anti_goal ?? ''} className={styles.input} placeholder="What they are most afraid of" />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Decision-making style</label>
        <select name="decision_making_style" defaultValue={pp?.decision_making_style ?? ''} className={styles.select}>
          <option value="">Unknown</option>
          <option value="data_driven">Data-driven</option>
          <option value="consensus_seeking">Consensus-seeking</option>
          <option value="risk_averse">Risk-averse</option>
          <option value="opportunistic">Opportunistic</option>
          <option value="process_oriented">Process-oriented</option>
        </select>
      </div>

      <p className={styles.sectionHeading}>Strategic constraints</p>

      <div className={styles.field}>
        <label className={styles.label}>Regulatory hurdles</label>
        <textarea name="regulatory_hurdles" rows={3} defaultValue={joinLines(sc?.regulatory_hurdles)} className={styles.textarea} placeholder="One per line" />
        <span className={styles.hint}>One per line</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Gatekeepers</label>
        <textarea name="gatekeepers" rows={2} defaultValue={joinLines(sc?.gatekeepers)} className={styles.textarea} placeholder="e.g. Board&#10;External accountant" />
        <span className={styles.hint}>One per line</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Preferred mediums</label>
        <textarea name="preferred_mediums" rows={2} defaultValue={joinLines(sc?.preferred_mediums)} className={styles.textarea} placeholder="e.g. Call&#10;PDF report" />
        <span className={styles.hint}>One per line</span>
      </div>

      <p className={styles.sectionHeading}>Success signals</p>

      <div className={styles.field}>
        <label className={styles.label}>Resonant phrases</label>
        <textarea name="resonant_phrases" rows={3} defaultValue={joinLines(ss?.resonant_phrases)} className={styles.textarea} placeholder="Phrases that have landed well in past meetings" />
        <span className={styles.hint}>One per line — used by Content Creator when drafting for this persona</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Pain point keywords</label>
        <textarea name="pain_point_keywords" rows={2} defaultValue={joinLines(ss?.pain_point_keywords)} className={styles.textarea} placeholder="e.g. debasement&#10;audit risk" />
        <span className={styles.hint}>One per line — used by Della to match contacts to this persona</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Success indicators</label>
        <textarea name="success_indicators" rows={2} defaultValue={joinLines(ss?.success_indicators)} className={styles.textarea} placeholder="Signs they are moving toward a decision" />
        <span className={styles.hint}>One per line</span>
      </div>

      <p className={styles.sectionHeading}>Objection bank</p>

      <div className={styles.field}>
        <label className={styles.label}>Common objections</label>
        <textarea name="objection_bank" rows={4} defaultValue={joinLines(defaultValues?.objection_bank)} className={styles.textarea} placeholder="e.g. What happens if we lose the keys?&#10;Our board won't approve this" />
        <span className={styles.hint}>Up to 5, one per line</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={defaultValues?.notes ?? ''} className={styles.textarea} />
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
