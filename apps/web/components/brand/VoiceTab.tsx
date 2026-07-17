'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/providers/ToastProvider';
import { Pencil, Lock, MessageSquareQuote } from 'lucide-react';
import { VoiceForm, VOICE_FORM_ID } from './VoiceForm';
import { SnippetForm, SNIPPET_FORM_ID } from './SnippetForm';
import { SnippetsPanel } from './SnippetsPanel';
import { AccountVoiceForm, ACCOUNT_VOICE_FORM_ID } from './AccountVoiceForm';
import { FeedbackGuidelinesPanel, type AccountGuidelinesRow, type ContentFeedbackRow } from './FeedbackGuidelinesPanel';
import { overrideCount } from './accountVoice';
import { canonSnippets, accountSnippets } from './snippetGroups';
import { toggleVoiceSnippetStar, deleteVoiceSnippet } from '@/app/actions/voice';
import type { BrandVoiceRow, SocialAccountRow, VoiceSnippetRow } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

const PLATFORM_LABEL: Record<SocialAccountRow['platform'], string> = {
  linkedin: 'LinkedIn',
  twitter_x: 'X',
};

interface VoiceTabProps {
  voice: BrandVoiceRow | null;
  snippets: VoiceSnippetRow[];
  accounts: SocialAccountRow[];
  guidelines: AccountGuidelinesRow[];
  feedback: ContentFeedbackRow[];
}

function ReadSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>{label}</div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

export function VoiceTab({ voice, snippets, accounts, guidelines, feedback }: VoiceTabProps) {
  const router = useRouter();
  const { error } = useToast();
  const [editingVoice, setEditingVoice] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SocialAccountRow | null>(null);
  const [accountPending, setAccountPending] = useState(false);
  const [snippetEditing, setSnippetEditing] = useState<VoiceSnippetRow | null | 'new'>(null);
  // Scope for a new snippet being added: null = company canon, otherwise the account id.
  // Unused when editing an existing snippet — its scope doesn't move.
  const [snippetScopeAccountId, setSnippetScopeAccountId] = useState<string | null>(null);
  const [snippetPending, setSnippetPending] = useState(false);
  const [deleting, setDeleting] = useState<VoiceSnippetRow | null>(null);

  const p = voice?.profile ?? {};
  const ownCanonSnippets = canonSnippets(snippets);

  const openAddSnippet = (accountId: string | null) => {
    setSnippetScopeAccountId(accountId);
    setSnippetEditing('new');
  };

  const editSnippet = (s: VoiceSnippetRow) => setSnippetEditing(s);

  const toggleStar = async (s: VoiceSnippetRow) => {
    const res = await toggleVoiceSnippetStar(s.id, !s.is_starred);
    if (res.error) error(res.error);
    else router.refresh();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await deleteVoiceSnippet(deleting.id);
    if (res.error) error(res.error);
    else router.refresh();
    setDeleting(null);
  };

  return (
    <div className={styles.container}>
      {/* Company voice */}
      <div className={styles.voiceHeader}>
        <div>
          <span className={styles.voiceTitle}>Company Voice</span>{' '}
          {voice && <span className={styles.version}>canon · v{voice.version}</span>}
        </div>
        <Button variant="primary" size="sm" onClick={() => setEditingVoice(true)}>
          <Pencil size={14} strokeWidth={1.5} />
          Edit voice
        </Button>
      </div>

      {!voice ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="Company voice not set"
          description="Define the voice every agent writes in — persona, tone, vocabulary, and the Bitcoin rule."
          actionLabel="Set company voice"
          onAction={() => setEditingVoice(true)}
        />
      ) : (
        <>
          {voice.mission_summary && <p className={styles.mission}>{voice.mission_summary}</p>}

          {p.persona && <ReadSection label="Persona">{p.persona}</ReadSection>}

          {p.tone_attributes && p.tone_attributes.length > 0 && (
            <ReadSection label="Tone attributes">
              <div className={styles.tagRow}>
                {p.tone_attributes.map((t) => (
                  <span key={t} className={styles.readChip}>{t}</span>
                ))}
              </div>
            </ReadSection>
          )}

          {p.vocabulary_do && p.vocabulary_do.length > 0 && (
            <ReadSection label="Vocabulary — use">
              <div className={styles.tagRow}>
                {p.vocabulary_do.map((t) => (
                  <span key={t} className={styles.readChip}>{t}</span>
                ))}
              </div>
            </ReadSection>
          )}

          {p.vocabulary_avoid && p.vocabulary_avoid.length > 0 && (
            <ReadSection label="Vocabulary — avoid">
              <div className={styles.tagRow}>
                {p.vocabulary_avoid.map((t) => (
                  <span key={t} className={`${styles.readChip} ${styles.readChipAvoid}`}>{t}</span>
                ))}
              </div>
            </ReadSection>
          )}

          {p.signature_devices && p.signature_devices.length > 0 && (
            <ReadSection label="Signature devices">
              <div className={styles.tagRow}>
                {p.signature_devices.map((t) => (
                  <span key={t} className={styles.readChip}>{t}</span>
                ))}
              </div>
            </ReadSection>
          )}

          {p.format_notes && <ReadSection label="Format notes">{p.format_notes}</ReadSection>}

          {voice.bitcoin_capitalisation_rule && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Bitcoin capitalisation rule</div>
              <div className={styles.lockedRule}>
                <Lock size={16} strokeWidth={1.5} />
                <span>{voice.bitcoin_capitalisation_rule}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Account voices */}
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Account voices</span>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No account voices"
          description="Founder and company accounts inherit the company voice. They appear here once added."
        />
      ) : (
        <div className={styles.accountList}>
          {accounts.map((a) => {
            const count = overrideCount(a.voice_profile, p);
            return (
              <button key={a.id} className={styles.accountRow} onClick={() => setEditingAccount(a)}>
                <div className={styles.accountMain}>
                  <span className={styles.accountName}>{a.display_name}</span>
                  <span className={styles.accountPlatform}>{PLATFORM_LABEL[a.platform]}</span>
                </div>
                <span className={styles.overrideCount}>
                  {count === 0 ? 'inherits all' : `${count} override${count === 1 ? '' : 's'}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Distilled feedback guidelines per account */}
      {accounts.length > 0 && (
        <FeedbackGuidelinesPanel accounts={accounts} guidelines={guidelines} feedback={feedback} />
      )}

      {/* Snippets panel */}
      <SnippetsPanel
        title="Voice snippets"
        ownSnippets={ownCanonSnippets}
        onAdd={() => openAddSnippet(null)}
        onEdit={editSnippet}
        onToggleStar={toggleStar}
        onDelete={setDeleting}
      />

      {/* Edit company voice */}
      <SlideOver
        open={editingVoice}
        onClose={() => setEditingVoice(false)}
        title="Edit company voice"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingVoice(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form={VOICE_FORM_ID} loading={voicePending}>Save voice</Button>
          </>
        }
      >
        <VoiceForm voice={voice} onSuccess={() => setEditingVoice(false)} onPendingChange={setVoicePending} />
      </SlideOver>

      {/* Edit account voice */}
      <SlideOver
        open={editingAccount !== null}
        onClose={() => setEditingAccount(null)}
        title={editingAccount ? `Edit ${editingAccount.display_name}` : 'Edit account voice'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingAccount(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form={ACCOUNT_VOICE_FORM_ID} loading={accountPending}>
              Save voice
            </Button>
          </>
        }
      >
        {editingAccount && (
          <AccountVoiceForm
            account={editingAccount}
            company={p}
            bitcoinRule={voice?.bitcoin_capitalisation_rule ?? null}
            canonSnippets={ownCanonSnippets}
            ownSnippets={accountSnippets(snippets, editingAccount.id)}
            onAddSnippet={() => openAddSnippet(editingAccount.id)}
            onEditSnippet={editSnippet}
            onToggleStarSnippet={toggleStar}
            onDeleteSnippet={setDeleting}
            onSuccess={() => setEditingAccount(null)}
            onPendingChange={setAccountPending}
          />
        )}
      </SlideOver>

      {/* Add / edit snippet */}
      <SlideOver
        open={snippetEditing !== null}
        onClose={() => setSnippetEditing(null)}
        title={snippetEditing && snippetEditing !== 'new' ? 'Edit snippet' : 'Add snippet'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSnippetEditing(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form={SNIPPET_FORM_ID} loading={snippetPending}>Save snippet</Button>
          </>
        }
      >
        {snippetEditing !== null && (
          <SnippetForm
            snippet={snippetEditing === 'new' ? null : snippetEditing}
            accountId={snippetScopeAccountId}
            onSuccess={() => setSnippetEditing(null)}
            onPendingChange={setSnippetPending}
          />
        )}
      </SlideOver>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete snippet"
        description="Remove this exemplar from the voice library? This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
