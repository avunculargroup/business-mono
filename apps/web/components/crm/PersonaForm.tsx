'use client';

import { createPersona, updatePersona } from '@/app/actions/personas';
import type { Persona } from '@platform/shared';
import { useEntityForm } from '@/hooks/useEntityForm';
import { FormField, FormRow, FormSelect, FormTextarea, FormError } from '@/components/ui/FormField';
import styles from '@/components/ui/Form.module.css';

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
  const pp = defaultValues?.psychographic_profile;
  const sc = defaultValues?.strategic_constraints;
  const ss = defaultValues?.success_signals;

  const { state, formAction } = useEntityForm({
    mode,
    entityLabel: 'Persona',
    create: createPersona,
    update: (formData) => updatePersona(defaultValues!.id, formData),
    onSuccess: (result) => onSuccess(result.persona as Persona | undefined),
    onPendingChange,
  });

  const formId = mode === 'edit' ? 'persona-edit-form' : 'persona-form';

  return (
    <form id={formId} action={formAction} className={styles.form}>
      <p className={styles.sectionHeading}>Identity</p>

      <FormField label="Internal name" name="name" required defaultValue={defaultValues?.name ?? ''} placeholder="e.g. Skeptical Treasurer" />

      <FormRow>
        <FormSelect label="Market segment" name="market_segment" required defaultValue={defaultValues?.market_segment ?? ''}>
          <option value="">Select…</option>
          <option value="sme">SME</option>
          <option value="public_company">Public Company</option>
          <option value="family_office">Family Office</option>
          <option value="hnw">HNW Individual</option>
          <option value="startup">Startup</option>
          <option value="superannuation">Superannuation</option>
        </FormSelect>
        <FormSelect label="Bitcoin sophistication" name="sophistication_level" defaultValue={defaultValues?.sophistication_level ?? 'intermediate'}>
          <option value="novice">Novice</option>
          <option value="intermediate">Intermediate</option>
          <option value="expert">Expert</option>
        </FormSelect>
      </FormRow>

      <FormField label="Estimated AUM / treasury size" name="estimated_aum" defaultValue={defaultValues?.estimated_aum ?? ''} placeholder="e.g. $50M–$500M" />

      <p className={styles.sectionHeading}>Psychographic profile</p>

      <FormField label="North star" name="north_star" defaultValue={pp?.north_star ?? ''} placeholder="The single biggest win they want" />

      <FormField label="Anti-goal" name="anti_goal" defaultValue={pp?.anti_goal ?? ''} placeholder="What they are most afraid of" />

      <FormSelect label="Decision-making style" name="decision_making_style" defaultValue={pp?.decision_making_style ?? ''}>
        <option value="">Unknown</option>
        <option value="data_driven">Data-driven</option>
        <option value="consensus_seeking">Consensus-seeking</option>
        <option value="risk_averse">Risk-averse</option>
        <option value="opportunistic">Opportunistic</option>
        <option value="process_oriented">Process-oriented</option>
      </FormSelect>

      <p className={styles.sectionHeading}>Strategic constraints</p>

      <FormTextarea label="Regulatory hurdles" name="regulatory_hurdles" rows={3} defaultValue={joinLines(sc?.regulatory_hurdles)} placeholder="One per line" hint="One per line" />

      <FormTextarea label="Gatekeepers" name="gatekeepers" rows={2} defaultValue={joinLines(sc?.gatekeepers)} placeholder={'e.g. Board\nExternal accountant'} hint="One per line" />

      <FormTextarea label="Preferred mediums" name="preferred_mediums" rows={2} defaultValue={joinLines(sc?.preferred_mediums)} placeholder={'e.g. Call\nPDF report'} hint="One per line" />

      <p className={styles.sectionHeading}>Success signals</p>

      <FormTextarea label="Resonant phrases" name="resonant_phrases" rows={3} defaultValue={joinLines(ss?.resonant_phrases)} placeholder="Phrases that have landed well in past meetings" hint="One per line — used by Content Creator when drafting for this persona" />

      <FormTextarea label="Pain point keywords" name="pain_point_keywords" rows={2} defaultValue={joinLines(ss?.pain_point_keywords)} placeholder={'e.g. debasement\naudit risk'} hint="One per line — used by Della to match contacts to this persona" />

      <FormTextarea label="Success indicators" name="success_indicators" rows={2} defaultValue={joinLines(ss?.success_indicators)} placeholder="Signs they are moving toward a decision" hint="One per line" />

      <p className={styles.sectionHeading}>Objection bank</p>

      <FormTextarea label="Common objections" name="objection_bank" rows={4} defaultValue={joinLines(defaultValues?.objection_bank)} placeholder={"e.g. What happens if we lose the keys?\nOur board won't approve this"} hint="Up to 5, one per line" />

      <FormTextarea label="Notes" name="notes" rows={2} defaultValue={defaultValues?.notes ?? ''} />

      {state?.error && <FormError>{state.error}</FormError>}
    </form>
  );
}
