'use client';

import { useActionState, useEffect, useState } from 'react';
import { updateBrandVoice } from '@/app/actions/voice';
import { useToast } from '@/providers/ToastProvider';
import { ChipField } from './ChipField';
import type { BrandVoiceRow, VoiceProfile } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

interface VoiceFormProps {
  voice: BrandVoiceRow | null;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export const VOICE_FORM_ID = 'company-voice-form';

export function VoiceForm({ voice, onSuccess, onPendingChange }: VoiceFormProps) {
  const { success, error } = useToast();
  const p: VoiceProfile = voice?.profile ?? {};

  const [persona, setPersona] = useState(p.persona ?? '');
  const [tone, setTone] = useState<string[]>(p.tone_attributes ?? []);
  const [vocabDo, setVocabDo] = useState<string[]>(p.vocabulary_do ?? []);
  const [vocabAvoid, setVocabAvoid] = useState<string[]>(p.vocabulary_avoid ?? []);
  const [devices, setDevices] = useState<string[]>(p.signature_devices ?? []);
  const [formatNotes, setFormatNotes] = useState(p.format_notes ?? '');
  const [mission, setMission] = useState(voice?.mission_summary ?? '');
  const [bitcoinRule, setBitcoinRule] = useState(voice?.bitcoin_capitalisation_rule ?? '');

  const handleSubmit = async () => {
    const fd = new FormData();
    fd.set(
      'profile',
      JSON.stringify({
        persona: persona.trim(),
        tone_attributes: tone,
        vocabulary_do: vocabDo,
        vocabulary_avoid: vocabAvoid,
        signature_devices: devices,
        format_notes: formatNotes.trim(),
      }),
    );
    fd.set('mission_summary', mission);
    fd.set('bitcoin_capitalisation_rule', bitcoinRule);

    const result = await updateBrandVoice(fd);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success(`Company voice saved (v${result.version})`);
    onSuccess();
    return null;
  };

  const [, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);

  return (
    <form id={VOICE_FORM_ID} action={formAction}>
      <div className={styles.field}>
        <label className={styles.label}>Persona</label>
        <textarea
          className={styles.textarea}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="One short paragraph: who this voice is and how it speaks."
        />
      </div>

      <ChipField
        label="Tone attributes"
        values={tone}
        onChange={setTone}
        placeholder="e.g. calm, plain-spoken"
        hint="Press Enter or comma to add"
        lowercase
      />

      <ChipField
        label="Vocabulary — use"
        values={vocabDo}
        onChange={setVocabDo}
        placeholder="Words and phrases to favour"
      />

      <ChipField
        label="Vocabulary — avoid (never use)"
        values={vocabAvoid}
        onChange={setVocabAvoid}
        placeholder="Banned words and phrases"
        hint="These carry through to every account voice and can't be un-banned there."
      />

      <ChipField
        label="Signature devices"
        values={devices}
        onChange={setDevices}
        placeholder="e.g. opens with a number, no exclamation marks"
      />

      <div className={styles.field}>
        <label className={styles.label}>Format notes</label>
        <textarea
          className={styles.textarea}
          value={formatNotes}
          onChange={(e) => setFormatNotes(e.target.value)}
          placeholder="Platform-shaping notes — formality, length, emoji rules."
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Company mission</label>
        <textarea
          className={styles.textarea}
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          placeholder="One paragraph: what BTS sounds like and why."
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Bitcoin capitalisation rule (enforced across all output)</label>
        <textarea
          className={styles.textarea}
          value={bitcoinRule}
          onChange={(e) => setBitcoinRule(e.target.value)}
          placeholder="Bitcoin (capital B) for the network; bitcoin (lowercase) for the unit."
        />
        <span className={styles.hint}>
          This rule is always applied and never overridable by an account voice.
        </span>
      </div>
    </form>
  );
}
