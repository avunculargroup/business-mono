'use client';

import { useMemo, useState, useTransition } from 'react';
import { ShieldCheck, AlertTriangle, Flag, RefreshCw, Check, ChevronDown } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { submitVariantGateDecision } from '@/app/actions/campaigns';
import styles from './VariantEditor.module.css';

// The Gate 3 surface: a platform-mimic preview of the generated variant, a live
// character counter against the platform limit, Lex's compliance verdict as a
// calm expandable chip, and inline approve / request-change. The decision is
// written to content_items.pending_decision; the agents listener resumes the run.
// Inline copy editing (with compliance re-run) is deferred to Step 9.

type Platform = 'linkedin' | 'twitter_x';
type Classification = 'educational' | 'general_advice' | 'personal_opinion';

interface GatePreview {
  platform: Platform;
  accountName: string;
  isThread: boolean;
  title: string;
  body: string;
  segments: string[];
  charCount: number;
  charLimit: number;
  classification: Classification;
  needsDisclaimer: boolean;
  disclaimerKey: string | null;
  rationale: string;
}

interface GateState {
  gate: string;
  contentItemId: string;
  preview: GatePreview;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  twitter_x: 'X',
  linkedin: 'LinkedIn',
};

const COMPLIANCE: Record<
  Classification,
  { label: string; color: 'success' | 'warning' | 'destructive'; note: string; Icon: typeof ShieldCheck }
> = {
  educational: {
    label: 'Educational',
    color: 'success',
    note: 'Reads as education, not advice. No disclaimer needed.',
    Icon: ShieldCheck,
  },
  general_advice: {
    label: 'General advice',
    color: 'warning',
    note: 'A disclaimer has been auto-attached.',
    Icon: AlertTriangle,
  },
  personal_opinion: {
    label: 'Personal opinion',
    color: 'destructive',
    note: 'Reads as a personal take — worth your judgement before it goes out.',
    Icon: Flag,
  },
};

export function VariantEditor({
  contentItemId,
  status,
  gateState,
}: {
  contentItemId: string;
  status: string;
  gateState: GateState | null;
}) {
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showChange, setShowChange] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [showRationale, setShowRationale] = useState(false);

  const preview = gateState?.preview ?? null;

  const counter = useMemo(() => {
    if (!preview) return null;
    const ratio = preview.charLimit > 0 ? preview.charCount / preview.charLimit : 0;
    const tone = ratio > 1 ? 'over' : ratio >= 0.9 ? 'near' : 'ok';
    return { ratio, tone };
  }, [preview]);

  if (status === 'approved') {
    return (
      <div className={styles.resolved} role="status">
        <Check size={18} strokeWidth={1.5} />
        <span>This variant is approved. Nothing to review.</span>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className={styles.resolved} role="status">
        <span>This variant isn’t waiting for review right now.</span>
      </div>
    );
  }

  const compliance = COMPLIANCE[preview.classification];

  const submit = (
    decision: { decision: 'approve' } | { decision: 'request_change'; instruction: string },
    confirmation: string,
  ) => {
    startTransition(async () => {
      const result = await submitVariantGateDecision(contentItemId, decision);
      if (result.error) {
        error(result.error);
        return;
      }
      success(confirmation);
      setShowChange(false);
      setInstruction('');
    });
  };

  return (
    <div className={styles.layout}>
      {/* Platform-mimic preview */}
      <section className={styles.previewCol} aria-label="Post preview">
        <div className={`${styles.post} ${preview.platform === 'twitter_x' ? styles.postX : styles.postLinkedin}`}>
          <header className={styles.postHeader}>
            <span className={styles.avatar} aria-hidden />
            <div className={styles.postMeta}>
              <span className={styles.account}>{preview.accountName}</span>
              <span className={styles.platform}>{PLATFORM_LABEL[preview.platform]}</span>
            </div>
          </header>

          {preview.isThread ? (
            <ol className={styles.thread}>
              {preview.segments.map((seg, i) => (
                <li key={i} className={styles.segment}>
                  <span className={styles.segmentNo}>{i + 1}/</span>
                  <p className={styles.segmentBody}>{seg}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.body}>{preview.body}</p>
          )}

          {preview.needsDisclaimer && (
            <p className={styles.disclaimer}>
              Disclaimer{preview.disclaimerKey ? ` (${preview.disclaimerKey})` : ''} — auto-added by Lex
            </p>
          )}
        </div>
      </section>

      {/* Controls */}
      <section className={styles.controlsCol} aria-label="Review controls">
        <div className={styles.counterRow}>
          <span className={`${styles.counter} ${styles[`counter_${counter?.tone}`]}`}>
            {preview.charCount} / {preview.charLimit}
          </span>
          <span className={styles.counterLabel}>
            {counter?.tone === 'over'
              ? 'Over the limit'
              : counter?.tone === 'near'
                ? 'Near the limit'
                : 'Within the limit'}
            {preview.isThread ? ' (longest segment may still differ)' : ''}
          </span>
        </div>

        <button
          type="button"
          className={styles.chipButton}
          onClick={() => setShowRationale((v) => !v)}
          aria-expanded={showRationale}
        >
          <compliance.Icon size={16} strokeWidth={1.5} />
          <StatusChip label={compliance.label} color={compliance.color} />
          <ChevronDown size={16} strokeWidth={1.5} className={showRationale ? styles.chevOpen : undefined} />
        </button>
        {showRationale && (
          <div className={styles.rationale}>
            <p className={styles.complianceNote}>{compliance.note}</p>
            {preview.rationale && <p className={styles.rationaleText}>{preview.rationale}</p>}
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            loading={isPending}
            onClick={() => submit({ decision: 'approve' }, 'Approved — this variant is ready to post.')}
          >
            <Check size={16} strokeWidth={1.5} />
            Approve variant
          </Button>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => setShowChange((v) => !v)}
          >
            <RefreshCw size={16} strokeWidth={1.5} />
            Request a change
          </Button>
        </div>

        {showChange && (
          <div className={styles.changeForm}>
            <textarea
              className={styles.textarea}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="What should Charlie change? e.g. sharpen the opening line, lead with the balance-sheet number"
              rows={3}
            />
            <Button
              variant="primary"
              size="sm"
              loading={isPending}
              disabled={instruction.trim().length === 0}
              onClick={() =>
                submit(
                  { decision: 'request_change', instruction: instruction.trim() },
                  'On it — Charlie is reworking this variant.',
                )
              }
            >
              Send change
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
