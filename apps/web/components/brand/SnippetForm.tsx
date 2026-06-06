'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveVoiceSnippet } from '@/app/actions/voice';
import { useToast } from '@/providers/ToastProvider';
import { ChipField } from './ChipField';
import { SNIPPET_TYPES, type VoiceSnippetRow } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

interface SnippetFormProps {
  snippet?: VoiceSnippetRow | null;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export const SNIPPET_FORM_ID = 'voice-snippet-form';

export function SnippetForm({ snippet, onSuccess, onPendingChange }: SnippetFormProps) {
  const { success, error } = useToast();
  const [type, setType] = useState(snippet?.snippet_type ?? 'opener');
  const [body, setBody] = useState(snippet?.body ?? '');
  const [note, setNote] = useState(snippet?.curator_note ?? '');
  const [platform, setPlatform] = useState<string>(snippet?.platform ?? '');
  const [tags, setTags] = useState<string[]>(snippet?.topic_tags ?? []);

  const handleSubmit = async () => {
    const fd = new FormData();
    if (snippet?.id) fd.set('id', snippet.id);
    fd.set('snippet_type', type);
    fd.set('body', body);
    fd.set('curator_note', note);
    fd.set('platform', platform);
    fd.set('topic_tags', JSON.stringify(tags));

    const result = await saveVoiceSnippet(fd);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success(snippet?.id ? 'Snippet updated' : 'Snippet added');
    onSuccess();
    return null;
  };

  const [, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);

  return (
    <form id={SNIPPET_FORM_ID} action={formAction}>
      <div className={styles.field}>
        <label className={styles.label}>Snippet</label>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste the exemplar text — a phrase, opener, or full post that shows the voice."
          rows={5}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Why it works (curator note)</label>
        <textarea
          className={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What does this demonstrate about the voice? This is the teaching content — required."
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Type</label>
        <select className={styles.select} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {SNIPPET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Platform</label>
        <select className={styles.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">Any platform</option>
          <option value="linkedin">LinkedIn</option>
          <option value="twitter_x">X</option>
        </select>
      </div>

      <ChipField label="Topic tags" values={tags} onChange={setTags} placeholder="e.g. custody, volatility" lowercase />
    </form>
  );
}
