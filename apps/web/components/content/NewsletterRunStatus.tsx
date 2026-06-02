'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Newspaper, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/providers/ToastProvider';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { MarkdownRecordDisplay } from '@/components/company/MarkdownRecordDisplay';
import { submitNewsletterGateDecision } from '@/app/actions/newsletter';
import styles from './NewsletterRunStatus.module.css';

// In-progress newsletter run surface on the /content page. A five-phase stepper
// shows where the run is — driven by `current_step` so the long stretch between
// the two gates (research → drafting → editing → assembly) actually moves rather
// than sitting on a flat "running". When a run suspends at a human gate the
// stepper sits above a review panel so the gate can be approved from the web (the
// channel that previously required Signal); the decision is written to
// newsletter_runs.pending_decision and the agents-side listener resumes the run.
// Finished runs linger briefly as a "Published" confirmation, then fall away.

const ACTIVE_STATUSES = ['running', 'suspended_gate1', 'suspended_gate2', 'suspended_hold'];
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
// How long a finished run stays on screen as a confirmation before it disappears.
const TERMINAL_WINDOW_MS = 12 * 60 * 60 * 1000;

// The five human-readable phases, in order. The nine workflow steps collapse
// into these; `current_step` selects the active phase and its sub-label.
const PHASES = ['Gather', 'Story review', 'Write', 'Draft review', 'Publish'] as const;

interface PhasePosition {
  index: number;
  sub: string;
  tone: 'running' | 'waiting' | 'done' | 'error';
}

// current_step → { phase index, live sub-label }. Covers the steps that run
// between gates; gate/terminal states are resolved from `status` in positionFor.
const STEP_POSITION: Record<string, { index: number; sub: string }> = {
  retrieve: { index: 0, sub: 'Finding relevant material' },
  select_stories: { index: 0, sub: 'Selecting stories' },
  gate1: { index: 1, sub: 'Reviewing your selection' },
  research_enrich: { index: 2, sub: 'Researching' },
  draft_generation: { index: 2, sub: 'Drafting stories' },
  editorial_review: { index: 2, sub: 'Editing' },
  assemble: { index: 2, sub: 'Assembling the issue' },
  gate2: { index: 3, sub: 'Preparing the draft' },
  persist: { index: 4, sub: 'Publishing' },
};

function positionFor(run: NewsletterRun): PhasePosition {
  switch (run.status) {
    case 'suspended_gate1':
      return { index: 1, sub: 'Waiting for your review', tone: 'waiting' };
    case 'suspended_gate2':
      return { index: 3, sub: 'Waiting for your review', tone: 'waiting' };
    case 'suspended_hold':
      return { index: 3, sub: 'On hold — pick it up when you are ready', tone: 'waiting' };
    case 'completed':
      return { index: 4, sub: 'Saved to the content pipeline', tone: 'done' };
    case 'failed':
    case 'cancelled': {
      const step = run.current_step ? STEP_POSITION[run.current_step] : undefined;
      return { index: step?.index ?? 0, sub: run.notes?.trim() || 'Could not finish', tone: 'error' };
    }
    default: {
      const step = run.current_step ? STEP_POSITION[run.current_step] : undefined;
      return { index: step?.index ?? 0, sub: step?.sub ?? 'Starting up', tone: 'running' };
    }
  }
}

interface NewsletterRun {
  workflow_run_id: string;
  status: string;
  time_range: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string | null;
  current_step: string | null;
  content_item_id: string | null;
  notes: string | null;
  gate_message: string | null;
  gate_draft_markdown: string | null;
}

function isVisible(run: NewsletterRun): boolean {
  if (ACTIVE_STATUSES.includes(run.status)) return true;
  if (TERMINAL_STATUSES.includes(run.status)) {
    const at = run.completed_at ?? run.updated_at;
    return at ? Date.now() - new Date(at).getTime() < TERMINAL_WINDOW_MS : false;
  }
  return false;
}

export function NewsletterRunStatus() {
  const [run, setRun] = useState<NewsletterRun | null>(null);

  const refresh = useCallback(async () => {
    // newsletter_runs isn't in the web Database types yet — cast at the boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { data } = await supabase
      .from('newsletter_runs')
      .select(
        'workflow_run_id, status, time_range, started_at, completed_at, updated_at, current_step, content_item_id, notes, gate_message, gate_draft_markdown',
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

  if (!run || !isVisible(run)) return null;

  const position = positionFor(run);
  const isGate =
    run.status === 'suspended_gate1' ||
    run.status === 'suspended_gate2' ||
    run.status === 'suspended_hold';

  return (
    <div className={styles.widget}>
      <ProgressStepper run={run} position={position} />
      {isGate && <GatePanel run={run} />}
    </div>
  );
}

function ProgressStepper({ run, position }: { run: NewsletterRun; position: PhasePosition }) {
  const { index, sub, tone } = position;
  return (
    <div className={styles.stepper} role="status" aria-live="polite">
      <div className={styles.stepperHead}>
        <StatusChip label="Newsletter" color={tone === 'error' ? 'destructive' : 'accent'} />
        <span className={styles.meta}>{run.time_range} edition</span>
      </div>

      <ol className={styles.track}>
        {PHASES.map((phase, i) => {
          const state =
            i < index || (tone === 'done' && i === index)
              ? 'done'
              : i === index
                ? tone
                : 'upcoming';
          return (
            <li key={phase} className={styles.phase} data-state={state}>
              <span className={styles.node}>{state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}</span>
              <span className={styles.phaseLabel}>{phase}</span>
            </li>
          );
        })}
      </ol>

      <p className={styles.caption} data-tone={tone}>
        <span className={styles.captionPhase}>{PHASES[index]}</span>
        <span className={styles.captionSep}>·</span>
        {tone === 'done' && run.content_item_id ? (
          <Link className={styles.captionLink} href={`/content/${run.content_item_id}`}>
            {sub}
          </Link>
        ) : (
          <span>{sub}</span>
        )}
      </p>
    </div>
  );
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
        <span className={styles.meta}>{run.time_range} edition</span>
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
