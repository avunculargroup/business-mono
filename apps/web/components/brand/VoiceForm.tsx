'use client';

import { useActionState, useEffect, useState } from 'react';
import { updateBrandVoice } from '@/app/actions/voice';
import { useToast } from '@/providers/ToastProvider';
import { ChipField } from './ChipField';
import {
  REGISTER_OPTIONS,
  PARAGRAPHING_OPTIONS,
  HASHTAG_USE_OPTIONS,
  type BrandVoiceRow,
  type ContentPolicy,
  type FormatConfig,
  type VoiceProfile,
} from './voiceTypes';
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
  const cp: ContentPolicy = voice?.content_policy ?? {};

  const [persona, setPersona] = useState(p.persona ?? '');
  const [tone, setTone] = useState<string[]>(p.tone_attributes ?? []);
  const [vocabDo, setVocabDo] = useState<string[]>(p.vocabulary_do ?? []);
  const [vocabAvoid, setVocabAvoid] = useState<string[]>(p.vocabulary_avoid ?? []);
  const [devices, setDevices] = useState<string[]>(p.signature_devices ?? []);
  const [format, setFormat] = useState<FormatConfig>(p.format ?? {});
  const [mission, setMission] = useState(voice?.mission_summary ?? '');
  const [bitcoinRule, setBitcoinRule] = useState(voice?.bitcoin_capitalisation_rule ?? '');
  const [topicsEndorsed, setTopicsEndorsed] = useState<string[]>(cp.topics_endorsed ?? []);
  const [topicsAvoided, setTopicsAvoided] = useState<string[]>(cp.topics_avoided ?? []);
  const [alignedVoices, setAlignedVoices] = useState<string[]>(cp.aligned_voices ?? []);
  const [contrarianViews, setContrarianViews] = useState<string[]>(cp.contrarian_views ?? []);

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
        format,
      }),
    );
    fd.set('mission_summary', mission);
    fd.set('bitcoin_capitalisation_rule', bitcoinRule);
    fd.set(
      'content_policy',
      JSON.stringify({
        topics_endorsed: topicsEndorsed,
        topics_avoided: topicsAvoided,
        aligned_voices: alignedVoices,
        contrarian_views: contrarianViews,
      }),
    );

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

      {/* Format — structured per-property defaults for company voice */}
      <div className={styles.field}>
        <label className={styles.label}>Format</label>

        <div className={styles.field}>
          <label className={styles.label}>Word count</label>
          <div className={styles.fieldRow}>
            <input
              type="number"
              className={styles.input}
              min={1}
              placeholder="Min"
              value={format.word_count_min ?? ''}
              onChange={(e) =>
                setFormat((f) => ({
                  ...f,
                  word_count_min: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
            <span className={styles.fieldRowSep}>–</span>
            <input
              type="number"
              className={styles.input}
              min={1}
              placeholder="Max"
              value={format.word_count_max ?? ''}
              onChange={(e) =>
                setFormat((f) => ({
                  ...f,
                  word_count_max: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Register</label>
          <select
            className={styles.select}
            value={format.register ?? ''}
            onChange={(e) =>
              setFormat((f) => ({
                ...f,
                register: (e.target.value as typeof REGISTER_OPTIONS[number]) || undefined,
              }))
            }
          >
            <option value="">— not set</option>
            {REGISTER_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Paragraphing</label>
          <select
            className={styles.select}
            value={format.paragraphing ?? ''}
            onChange={(e) =>
              setFormat((f) => ({
                ...f,
                paragraphing: (e.target.value as typeof PARAGRAPHING_OPTIONS[number]) || undefined,
              }))
            }
          >
            <option value="">— not set</option>
            <option value="single-block">Single block</option>
            <option value="short-paragraphs">Short paragraphs</option>
            <option value="platform-default">Platform default</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Hashtag use</label>
          <select
            className={styles.select}
            value={format.hashtag_use ?? ''}
            onChange={(e) =>
              setFormat((f) => ({
                ...f,
                hashtag_use: (e.target.value as typeof HASHTAG_USE_OPTIONS[number]) || undefined,
              }))
            }
          >
            <option value="">— not set</option>
            <option value="none">None</option>
            <option value="sparingly">Sparingly (1–2)</option>
            <option value="platform-default">Platform default</option>
          </select>
        </div>
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

      <div className={styles.voiceDivider}>Topic & positioning policy</div>

      <ChipField
        label="Topics to comment on"
        values={topicsEndorsed}
        onChange={setTopicsEndorsed}
        placeholder="Topics we'll post about publicly"
        hint="Applied company-wide to every draft."
      />

      <ChipField
        label="Topics to avoid (never post about these)"
        values={topicsAvoided}
        onChange={setTopicsAvoided}
        placeholder="Off-limits topics"
      />

      <ChipField
        label="Voices we align with"
        values={alignedVoices}
        onChange={setAlignedVoices}
        placeholder="Thought leaders and companies"
      />

      <ChipField
        label="Voices we respectfully disagree with"
        values={contrarianViews}
        onChange={setContrarianViews}
        placeholder="Positions to push back on"
      />
    </form>
  );
}
