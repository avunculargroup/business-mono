'use client';

import { useActionState, useEffect, useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import { updateAccountVoice } from '@/app/actions/voice';
import { useToast } from '@/providers/ToastProvider';
import { ChipField } from './ChipField';
import { SnippetsPanel } from './SnippetsPanel';
import { lockedAvoidWords } from './accountVoice';
import type { SocialAccountRow, VoiceProfile, VoiceSnippetRow } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

interface AccountVoiceFormProps {
  account: SocialAccountRow;
  company: VoiceProfile;
  bitcoinRule: string | null;
  canonSnippets: VoiceSnippetRow[];
  ownSnippets: VoiceSnippetRow[];
  onAddSnippet: () => void;
  onEditSnippet: (snippet: VoiceSnippetRow) => void;
  onToggleStarSnippet: (snippet: VoiceSnippetRow) => void;
  onDeleteSnippet: (snippet: VoiceSnippetRow) => void;
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export const ACCOUNT_VOICE_FORM_ID = 'account-voice-form';

/** Label + inherited/overridden tag + reset, shown above each profile field. */
function FieldHeader({
  label,
  overridden,
  onReset,
}: {
  label: string;
  overridden: boolean;
  onReset: () => void;
}) {
  return (
    <div className={styles.fieldHeader}>
      <label className={styles.label}>{label}</label>
      {overridden ? (
        <button type="button" className={styles.resetLink} onClick={onReset}>
          <RotateCcw size={12} strokeWidth={1.5} />
          Reset — <span className={styles.overrideTag}>overridden</span>
        </button>
      ) : (
        <span className={styles.inheritTag}>inherited</span>
      )}
    </div>
  );
}

/** Ghosted preview of the inherited company value, shown when a field isn't overridden. */
function GhostText({ value }: { value: string | undefined }) {
  if (!value) return <span className={styles.ghostEmpty}>Not set on Company Voice</span>;
  return <span className={styles.ghostText}>{value}</span>;
}

function GhostChips({ values }: { values: string[] | undefined }) {
  if (!values || values.length === 0) return <span className={styles.ghostEmpty}>Not set on Company Voice</span>;
  return (
    <div className={styles.tagRow}>
      {values.map((v) => (
        <span key={v} className={styles.ghostChip}>{v}</span>
      ))}
    </div>
  );
}

export function AccountVoiceForm({
  account,
  company,
  bitcoinRule,
  canonSnippets,
  ownSnippets,
  onAddSnippet,
  onEditSnippet,
  onToggleStarSnippet,
  onDeleteSnippet,
  onSuccess,
  onPendingChange,
}: AccountVoiceFormProps) {
  const { success, error } = useToast();
  const p = account.voice_profile ?? {};
  const locked = lockedAvoidWords(company);

  const [displayName, setDisplayName] = useState(account.display_name ?? '');
  const [handle, setHandle] = useState(account.handle ?? '');
  const [profileUrl, setProfileUrl] = useState(account.profile_url ?? '');

  const [persona, setPersona] = useState(p.persona ?? '');
  const [tone, setTone] = useState<string[]>(p.tone_attributes ?? []);
  const [vocabDo, setVocabDo] = useState<string[]>(p.vocabulary_do ?? []);
  // Stored account avoids exclude the locked company bans (those carry through
  // via the merge union); show only the account's own additions here.
  const [vocabAvoid, setVocabAvoid] = useState<string[]>(
    (p.vocabulary_avoid ?? []).filter((w) => !locked.some((l) => l.toLowerCase() === w.toLowerCase())),
  );
  const [devices, setDevices] = useState<string[]>(p.signature_devices ?? []);
  const [formatNotes, setFormatNotes] = useState(p.format_notes ?? '');

  const handleSubmit = async () => {
    const fd = new FormData();
    fd.set('id', account.id);
    fd.set('display_name', displayName);
    fd.set('handle', handle);
    fd.set('profile_url', profileUrl);
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

    const result = await updateAccountVoice(fd);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success('Account voice saved');
    onSuccess();
    return null;
  };

  const [, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => onPendingChange?.(isPending), [isPending, onPendingChange]);

  return (
    <form id={ACCOUNT_VOICE_FORM_ID} action={formAction}>
      <p className={styles.inheritHelper}>
        This voice inherits from Company Voice. Edit a field to override it for this account; banned
        words and the Bitcoin rule always carry through.
      </p>

      {/* Account identity */}
      <div className={styles.field}>
        <label className={styles.label}>Display name</label>
        <input
          className={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Chris · X"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Handle</label>
        <input
          className={styles.input}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="e.g. @chris"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Profile URL</label>
        <input
          className={styles.input}
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>

      <div className={styles.voiceDivider}>Voice</div>

      {/* Persona */}
      <div className={styles.field}>
        <FieldHeader label="Persona" overridden={persona.trim().length > 0} onReset={() => setPersona('')} />
        {persona.trim().length === 0 && (
          <div className={styles.ghostPreview}>
            <GhostText value={company.persona} />
          </div>
        )}
        <textarea
          className={styles.textarea}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Override the persona for this account…"
        />
      </div>

      {/* Tone attributes */}
      <div className={styles.field}>
        <FieldHeader label="Tone attributes" overridden={tone.length > 0} onReset={() => setTone([])} />
        {tone.length === 0 && (
          <div className={styles.ghostPreview}>
            <GhostChips values={company.tone_attributes} />
          </div>
        )}
        <ChipField label="" values={tone} onChange={setTone} placeholder="Add to override" lowercase />
      </div>

      {/* Vocabulary — use */}
      <div className={styles.field}>
        <FieldHeader label="Vocabulary — use" overridden={vocabDo.length > 0} onReset={() => setVocabDo([])} />
        {vocabDo.length === 0 && (
          <div className={styles.ghostPreview}>
            <GhostChips values={company.vocabulary_do} />
          </div>
        )}
        <ChipField label="" values={vocabDo} onChange={setVocabDo} placeholder="Add to override" />
      </div>

      {/* Vocabulary — avoid (company bans locked) */}
      <div className={styles.field}>
        <FieldHeader
          label="Vocabulary — avoid"
          overridden={vocabAvoid.length > 0}
          onReset={() => setVocabAvoid([])}
        />
        <ChipField
          label=""
          values={vocabAvoid}
          onChange={setVocabAvoid}
          lockedValues={locked}
          placeholder="Add account-specific bans"
          hint="Company-banned words (dashed) always carry through and can't be removed here."
        />
      </div>

      {/* Signature devices */}
      <div className={styles.field}>
        <FieldHeader label="Signature devices" overridden={devices.length > 0} onReset={() => setDevices([])} />
        {devices.length === 0 && (
          <div className={styles.ghostPreview}>
            <GhostChips values={company.signature_devices} />
          </div>
        )}
        <ChipField label="" values={devices} onChange={setDevices} placeholder="Add to override" />
      </div>

      {/* Format notes */}
      <div className={styles.field}>
        <FieldHeader
          label="Format notes"
          overridden={formatNotes.trim().length > 0}
          onReset={() => setFormatNotes('')}
        />
        {formatNotes.trim().length === 0 && (
          <div className={styles.ghostPreview}>
            <GhostText value={company.format_notes} />
          </div>
        )}
        <textarea
          className={styles.textarea}
          value={formatNotes}
          onChange={(e) => setFormatNotes(e.target.value)}
          placeholder="Override platform-shaping notes for this account…"
        />
      </div>

      {/* Bitcoin rule — locked, company-level */}
      {bitcoinRule && (
        <div className={styles.field}>
          <label className={styles.label}>Bitcoin capitalisation rule</label>
          <div className={styles.lockedRule}>
            <Lock size={16} strokeWidth={1.5} />
            <span>{bitcoinRule}</span>
          </div>
          <span className={styles.hint}>Enforced from Company Voice — not overridable here.</span>
        </div>
      )}

      <div className={styles.voiceDivider}>Snippets</div>
      <SnippetsPanel
        title="Snippets"
        emptyDescription="Exemplars specific to this account's voice. Canon snippets from Company Voice apply here too — add this account's own to sharpen it further."
        canonSnippets={canonSnippets}
        ownSnippets={ownSnippets}
        onAdd={onAddSnippet}
        onEdit={onEditSnippet}
        onToggleStar={onToggleStarSnippet}
        onDelete={onDeleteSnippet}
      />
    </form>
  );
}
