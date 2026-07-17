'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SlideOver } from '@/components/ui/SlideOver';
import { useToast } from '@/providers/ToastProvider';
import { updateAccountGuidelines } from '@/app/actions/voice';
import { formatDate } from '@/lib/utils';
import type { SocialAccountRow } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

// Distilled feedback guidelines per account: standing rules the distiller
// builds from founder review feedback, injected into every future draft. The
// textarea (one guideline per line) is the whole curation surface — edits here
// are the human override on the machine-written list.

const PLATFORM_LABEL: Record<SocialAccountRow['platform'], string> = {
  linkedin: 'LinkedIn',
  twitter_x: 'X',
};

export type AccountGuidelinesRow = {
  social_account_id: string;
  guidelines: string[];
};

export type ContentFeedbackRow = {
  id: string;
  social_account_id: string;
  verdict: string | null;
  feedback: string;
  created_at: string;
};

interface FeedbackGuidelinesPanelProps {
  accounts: SocialAccountRow[];
  guidelines: AccountGuidelinesRow[];
  feedback: ContentFeedbackRow[];
}

export function FeedbackGuidelinesPanel({ accounts, guidelines, feedback }: FeedbackGuidelinesPanelProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [editing, setEditing] = useState<SocialAccountRow | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);

  const guidelinesFor = (accountId: string): string[] =>
    guidelines.find((g) => g.social_account_id === accountId)?.guidelines ?? [];

  const openAccount = (account: SocialAccountRow) => {
    setText(guidelinesFor(account.id).join('\n'));
    setEditing(account);
  };

  const save = async () => {
    if (!editing) return;
    setPending(true);
    const res = await updateAccountGuidelines(editing.id, text);
    setPending(false);
    if (res.error) {
      error(res.error);
    } else {
      success('Guidelines saved');
      setEditing(null);
      router.refresh();
    }
  };

  const editingFeedback = editing ? feedback.filter((f) => f.social_account_id === editing.id) : [];

  return (
    <>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Feedback guidelines</span>
      </div>
      <p className={styles.hint}>
        Distilled from review feedback on generated drafts. Applied to every future draft for the account.
      </p>
      <div className={styles.accountList}>
        {accounts.map((a) => {
          const count = guidelinesFor(a.id).length;
          return (
            <button key={a.id} className={styles.accountRow} onClick={() => openAccount(a)}>
              <div className={styles.accountMain}>
                <span className={styles.accountName}>{a.display_name}</span>
                <span className={styles.accountPlatform}>{PLATFORM_LABEL[a.platform]}</span>
              </div>
              <span className={styles.overrideCount}>
                {count === 0 ? 'no guidelines yet' : `${count} guideline${count === 1 ? '' : 's'}`}
              </span>
            </button>
          );
        })}
      </div>

      <SlideOver
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Guidelines — ${editing.display_name}` : 'Guidelines'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={pending}>Save guidelines</Button>
          </>
        }
      >
        <div className={styles.field}>
          <label className={styles.label}>Guidelines — one per line</label>
          <textarea
            className={styles.textarea}
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Never open with a rhetorical question."
          />
          <p className={styles.hint}>
            New review feedback is folded into this list automatically; edits here are kept as the starting point.
          </p>
        </div>

        {editingFeedback.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Recent feedback</div>
            <div className={styles.snippetList}>
              {editingFeedback.map((f) => (
                <div key={f.id} className={styles.sectionBody}>
                  <span className={styles.version}>
                    {f.verdict === 'positive' ? 'Good · ' : f.verdict === 'negative' ? 'Needs work · ' : ''}
                    {formatDate(f.created_at)}
                  </span>
                  <div>{f.feedback}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
