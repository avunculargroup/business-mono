'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Newspaper } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/providers/ToastProvider';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { MarkdownRecordDisplay } from '@/components/company/MarkdownRecordDisplay';
import { submitNewsletterGateDecision } from '@/app/actions/newsletter';
import styles from './NewsletterRunStatus.module.css';

// In-progress newsletter run surface on the /content page. For non-suspended
// runs this is a glanceable status strip. When a run suspends at a human gate it
// expands into a review panel so the gate can be approved from the web — the
// channel that previously required Signal. The decision is written to
// newsletter_runs.pending_decision; the agents-side listener resumes the run.

const ACTIVE_STATUSES = ['running', 'suspended_gate1', 'suspended_gate2', 'suspended_hold'];
// Terminal states worth surfacing briefly so a director sees what happened. Old
// ones are filtered out by a 24h window in the query (the realtime sub refreshes).
const NOTICE_STATUSES = ['failed', 'no_stories'];
const NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  running: 'Newsletter starting…',
  suspended_gate1: 'Story selection sent for review',
  suspended_gate2: 'Draft ready for review',
  suspended_hold: 'Newsletter on hold',
};

const NOTICE_LABEL: Record<string, string> = {
  failed: "Newsletter couldn't be completed",
  no_stories: 'No stories to run',
};

// Adjective form of the run's cadence for the "… edition" descriptor.
const EDITION_LABEL: Record<string, string> = {
  week: 'Weekly',
  fortnight: 'Fortnightly',
  month: 'Monthly',
};

function editionDescriptor(timeRange: string): string {
  return `${EDITION_LABEL[timeRange] ?? timeRange} edition`;
}

interface NewsletterRun {
  workflow_run_id: string;
  status: string;
  time_range: string;
  started_at: string;
  gate_message: string | null;
  gate_draft_markdown: string | null;
  notes: string | null;
}

export function NewsletterRunStatus() {
  const [run, setRun] = useState<NewsletterRun | null>(null);
  const [stepLabel, setStepLabel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    // Active runs always show; terminal notices only if recent so old failures
    // don't haunt the page forever.
    const cutoff = new Date(Date.now() - NOTICE_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from('newsletter_runs')
      .select('workflow_run_id, status, time_range, started_at, gate_message, gate_draft_markdown, notes')
      .or(
        `status.in.(${ACTIVE_STATUSES.join(',')}),and(status.in.(${NOTICE_STATUSES.join(',')}),started_at.gt.${cutoff})`,
      )
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun((data as NewsletterRun | null) ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeSubscription(
    'newsletter_runs',
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const runId = run?.workflow_run_id;

  const refreshProgress = useCallback(async () => {
    if (!runId) {
      setStepLabel(null);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('workflow_progress')
      .select('step_label')
      .eq('workflow_run_id', runId)
      .maybeSingle();
    setStepLabel((data?.step_label as string | undefined) ?? null);
  }, [runId]);

  useEffect(() => {
    void refreshProgress();
  }, [refreshProgress]);

  useRealtimeSubscription(
    'workflow_progress',
    useCallback(() => {
      void refreshProgress();
    }, [refreshProgress]),
    runId ? `workflow_run_id=eq.${runId}` : undefined,
  );

  if (!run) return null;

  if (NOTICE_STATUSES.includes(run.status)) {
    const reason = run.notes ?? run.gate_message;
    const isFailure = run.status === 'failed';
    return (
      <div className={`${styles.banner} ${styles.notice}`} role="status">
        <StatusChip label="Newsletter" color={isFailure ? 'destructive' : 'warning'} />
        <span className={styles.label}>{NOTICE_LABEL[run.status] ?? run.status}</span>
        <span className={styles.meta}>{editionDescriptor(run.time_range)}</span>
        {reason && <p className={styles.noticeReason}>{reason}</p>}
      </div>
    );
  }

  const isGate =
    run.status === 'suspended_gate1' ||
    run.status === 'suspended_gate2' ||
    run.status === 'suspended_hold';

  if (!isGate) {
    return (
      <div className={styles.banner} role="status">
        <StatusChip label="Newsletter" color="accent" />
        <span className={styles.label}>{stepLabel ?? STATUS_LABEL[run.status] ?? run.status}</span>
        <span className={styles.meta}>{editionDescriptor(run.time_range)}</span>
      </div>
    );
  }

  return <GatePanel run={run} />;
}

function GatePanel({ run }: { run: NewsletterRun }) {
  const { success, error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [openForm, setOpenForm] = useState<'adjust' | 'revise' | null>(null);
  const [text, setText] = useState('');
  const [storyNumber, setStoryNumber] = useState('1');

  const isGate1 = run.status === 'suspended_gate1';

  const submit = (
    decision:
      | { decision: 'approve' }
      | { decision: 'adjust'; adjustment: string }
      | { decision: 'publish' }
      | { decision: 'hold' }
      | { decision: 'revise'; storyNumber: number; instruction: string },
    confirmation: string,
  ) => {
    startTransition(async () => {
      const result = await submitNewsletterGateDecision(run.workflow_run_id, decision);
      if (result.error) {
        error(result.error);
        return;
      }
      success(confirmation);
      setOpenForm(null);
      setText('');
    });
  };

  return (
    <section className={styles.panel} aria-label="Newsletter review">
      <header className={styles.panelHeader}>
        <Newspaper size={18} strokeWidth={1.5} />
        <span className={styles.panelTitle}>
          {run.status === 'suspended_gate1'
            ? 'Story selection — does this look right?'
            : run.status === 'suspended_hold'
              ? 'Newsletter on hold — ready when you are'
              : 'Draft ready — does this look right?'}
        </span>
        <span className={styles.meta}>{editionDescriptor(run.time_range)}</span>
      </header>

      {run.gate_message && <pre className={styles.gateMessage}>{run.gate_message}</pre>}

      {run.gate_draft_markdown && (
        <details className={styles.draft} open>
          <summary className={styles.draftSummary}>Full draft</summary>
          <div className={styles.draftBody}>
            <MarkdownRecordDisplay content={run.gate_draft_markdown} />
          </div>
        </details>
      )}

      <div className={styles.actions}>
        {isGate1 ? (
          <>
            <Button
              variant="primary"
              loading={isPending}
              onClick={() => submit({ decision: 'approve' }, 'Approved — drafting the stories now.')}
            >
              Approve stories
            </Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpenForm(openForm === 'adjust' ? null : 'adjust')}
            >
              Request changes
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              loading={isPending}
              onClick={() => submit({ decision: 'publish' }, 'Publishing — saving it to the content pipeline.')}
            >
              Publish to pipeline
            </Button>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpenForm(openForm === 'revise' ? null : 'revise')}
            >
              Request a revision
            </Button>
            {run.status !== 'suspended_hold' && (
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => submit({ decision: 'hold' }, 'Holding the newsletter — pick it back up whenever.')}
              >
                Hold
              </Button>
            )}
          </>
        )}
      </div>

      {openForm === 'adjust' && (
        <div className={styles.form}>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should change? e.g. swap story 3 for the regulation piece, add more on custody"
            rows={3}
          />
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            disabled={text.trim().length === 0}
            onClick={() =>
              submit(
                { decision: 'adjust', adjustment: text.trim() },
                'Got it — reworking the shortlist.',
              )
            }
          >
            Send changes
          </Button>
        </div>
      )}

      {openForm === 'revise' && (
        <div className={styles.form}>
          <div className={styles.reviseRow}>
            <label className={styles.reviseLabel}>
              Story
              <input
                className={styles.numberInput}
                type="number"
                min={1}
                value={storyNumber}
                onChange={(e) => setStoryNumber(e.target.value)}
              />
            </label>
          </div>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should change in this story?"
            rows={3}
          />
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            disabled={text.trim().length === 0}
            onClick={() =>
              submit(
                {
                  decision: 'revise',
                  storyNumber: Number.parseInt(storyNumber, 10) || 1,
                  instruction: text.trim(),
                },
                `On it — revising story ${storyNumber}.`,
              )
            }
          >
            Send revision
          </Button>
        </div>
      )}
    </section>
  );
}
