'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RefreshCw, Lock, Loader, MessageSquare, ListOrdered } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { AutoGrowTextarea } from '@/components/ui/AutoGrowTextarea';
import { StatusChip } from '@/components/ui/StatusChip';
import { submitCampaignGateDecision } from '@/app/actions/campaigns';
import styles from './CampaignWorkspace.module.css';

// The campaign canvas + the two review gates. When the strategy workflow is
// suspended on this campaign, gate_state names which gate is open; the founder
// reviews (and may edit), then approves or requests a change. The decision is
// written to campaigns.pending_decision; the strategyGateWeb listener resumes
// the run. After plan approval the canvas is read-only (strategy locked).

interface Strategy {
  content_pillars: string[];
  key_messages: string[];
  audience_summary: string;
  tone_guidance: string;
  hooks: string[];
  hashtags: string[];
  do_not_say: string[];
  success_signals: string[];
}

interface PlannedBeat {
  title: string;
  core_message: string;
  rationale: string;
  prefer_thread: boolean;
}

interface ScheduleEntry {
  beat_sequence: number;
  beat_title: string | null;
  social_account_id: string;
  slot_label: string | null;
  scheduled_for: string | null;
}

interface SchedulePlan {
  entries: ScheduleEntry[];
}

interface Gate1State {
  gate: 'gate1';
  campaignId: string;
  strategy: Strategy;
}

interface Gate2State {
  gate: 'gate2';
  campaignId: string;
  beats: PlannedBeat[];
  schedule: SchedulePlan;
}

export interface CampaignRow {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  strategy: Strategy | null;
  schedule_plan: SchedulePlan | null;
  gate_state: Gate1State | Gate2State | null;
  pending_decision: unknown;
  workflow_run_id: string | null;
}

export interface BeatRow {
  id: string;
  sequence: number;
  title: string | null;
  core_message: string;
  rationale: string | null;
  prefer_thread: boolean;
}

const EMPTY_STRATEGY: Strategy = {
  content_pillars: [],
  key_messages: [],
  audience_summary: '',
  tone_guidance: '',
  hooks: [],
  hashtags: [],
  do_not_say: [],
  success_signals: [],
};

const linesToArray = (v: string): string[] =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

function formatSlot(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Unscheduled';
  const [date, time] = scheduledFor.split('T');
  return time ? `${date} · ${time.slice(0, 5)}` : (date ?? scheduledFor);
}

export function CampaignWorkspace({ campaign, beats }: { campaign: CampaignRow; beats: BeatRow[] }) {
  const router = useRouter();
  const { error, success } = useToast();
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const gate = campaign.gate_state;
  const hasOpenGate = Boolean(campaign.workflow_run_id && gate?.gate);
  const isLocked = ['plan_approved', 'active', 'completed', 'archived'].includes(campaign.status);

  // The campaign row is server-fetched props; on a Realtime change, re-pull the
  // page's server component so gate_state/status/strategy stay current without
  // a manual refresh.
  useRealtimeSubscription(
    'campaigns',
    useCallback(() => {
      router.refresh();
    }, [router]),
    `id=eq.${campaign.id}`,
  );

  const runId = campaign.workflow_run_id;
  const [stepLabel, setStepLabel] = useState<string | null>(null);

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

  const submit = (decision: unknown, confirmation: string) => {
    startTransition(async () => {
      const result = await submitCampaignGateDecision(campaign.id, decision);
      if (result.error) {
        error(result.error);
        return;
      }
      success(confirmation);
      setSubmitted(true);
      router.refresh();
    });
  };

  return (
    <div className={styles.wrap}>
      {campaign.objective && (
        <section className={styles.summary}>
          <span className={styles.kicker}>Objective</span>
          <p className={styles.objective}>{campaign.objective}</p>
          <StatusChip label={campaign.status.replace(/_/g, ' ')} color={isLocked ? 'success' : 'accent'} />
        </section>
      )}

      {/* Working state: launched or between gates, nothing to decide yet. */}
      {!hasOpenGate && !isLocked && (
        <div className={styles.working} role="status">
          <Loader size={18} strokeWidth={1.5} className={styles.spin} />
          <span>{stepLabel ?? 'Margot is working on the next step. This page updates once she has something to review.'}</span>
        </div>
      )}

      {hasOpenGate && gate?.gate === 'gate1' && (
        // Key on the content so a regenerated strategy (request-change loop)
        // remounts the panel — resetting the latched "submitted" state and
        // re-seeding the edit fields from the new strategy.
        <Gate1Panel
          key={JSON.stringify(gate.strategy)}
          strategy={gate.strategy}
          isPending={isPending}
          submitted={submitted}
          onSubmit={submit}
        />
      )}

      {hasOpenGate && gate?.gate === 'gate2' && (
        <Gate2Panel
          key={JSON.stringify(gate.beats)}
          beats={gate.beats}
          schedule={gate.schedule}
          isPending={isPending}
          submitted={submitted}
          onSubmit={submit}
        />
      )}

      {isLocked && <LockedCanvas strategy={campaign.strategy} beats={beats} schedule={campaign.schedule_plan} />}
    </div>
  );
}

// ── Gate 1 — strategy review ──────────────────────────────────────────────────

function Gate1Panel({
  strategy,
  isPending,
  submitted,
  onSubmit,
}: {
  strategy: Strategy;
  isPending: boolean;
  submitted: boolean;
  onSubmit: (decision: unknown, confirmation: string) => void;
}) {
  const s = { ...EMPTY_STRATEGY, ...strategy };
  const [pillars, setPillars] = useState(s.content_pillars.join('\n'));
  const [messages, setMessages] = useState(s.key_messages.join('\n'));
  const [audience, setAudience] = useState(s.audience_summary);
  const [tone, setTone] = useState(s.tone_guidance);
  const [hooks, setHooks] = useState(s.hooks.join('\n'));
  const [hashtags, setHashtags] = useState(s.hashtags.join('\n'));
  const [doNotSay, setDoNotSay] = useState(s.do_not_say.join('\n'));
  const [signals, setSignals] = useState(s.success_signals.join('\n'));
  const [showChange, setShowChange] = useState(false);
  const [instruction, setInstruction] = useState('');

  const approve = () =>
    onSubmit(
      {
        decision: 'approve',
        strategy: {
          content_pillars: linesToArray(pillars),
          key_messages: linesToArray(messages),
          audience_summary: audience.trim(),
          tone_guidance: tone.trim(),
          hooks: linesToArray(hooks),
          hashtags: linesToArray(hashtags),
          do_not_say: linesToArray(doNotSay),
          success_signals: linesToArray(signals),
        },
      },
      'Strategy approved — Margot is planning the beats.',
    );

  return (
    <section className={styles.panel} aria-label="Strategy review">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Review the strategy</h2>
        <p className={styles.panelHint}>
          Edit anything before approving. Approving locks the strategy and sends Margot on to the beat plan.
        </p>
      </header>

      <Field label="Content pillars (one per line)" value={pillars} onChange={setPillars} />
      <Field label="Key messages (one per line)" value={messages} onChange={setMessages} />
      <Field label="Audience summary" value={audience} onChange={setAudience} />
      <Field label="Tone guidance" value={tone} onChange={setTone} />
      <Field label="Hooks (one per line)" value={hooks} onChange={setHooks} />
      <Field label="Hashtags (one per line)" value={hashtags} onChange={setHashtags} />
      <Field label="Do not say (one per line)" value={doNotSay} onChange={setDoNotSay} />
      <Field label="Success signals (one per line)" value={signals} onChange={setSignals} />

      <GateActions
        isPending={isPending}
        submitted={submitted}
        showChange={showChange}
        setShowChange={setShowChange}
        instruction={instruction}
        setInstruction={setInstruction}
        approveLabel="Approve strategy"
        changePlaceholder="What should Margot rethink? e.g. sharpen the pillars, add a regulatory angle."
        onApprove={approve}
        onRequestChange={() =>
          onSubmit(
            { decision: 'request_change', instruction: instruction.trim() },
            'On it — Margot is reworking the strategy.',
          )
        }
      />
    </section>
  );
}

// ── Gate 2 — plan review ──────────────────────────────────────────────────────

function Gate2Panel({
  beats,
  schedule,
  isPending,
  submitted,
  onSubmit,
}: {
  beats: PlannedBeat[];
  schedule: SchedulePlan;
  isPending: boolean;
  submitted: boolean;
  onSubmit: (decision: unknown, confirmation: string) => void;
}) {
  const [draft, setDraft] = useState<PlannedBeat[]>(beats);
  const [showChange, setShowChange] = useState(false);
  const [instruction, setInstruction] = useState('');

  const update = (i: number, patch: Partial<PlannedBeat>) =>
    setDraft((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const approve = () =>
    onSubmit(
      {
        decision: 'approve',
        beats: draft.map((b) => ({
          title: b.title,
          core_message: b.core_message,
          rationale: b.rationale,
          prefer_thread: b.prefer_thread,
        })),
      },
      'Plan approved — the campaign is locked and ready to fan out.',
    );

  return (
    <section className={styles.panel} aria-label="Plan review">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Review the beat plan</h2>
        <p className={styles.panelHint}>
          Each beat becomes a post for every account, in each account&rsquo;s voice. Approving locks the
          plan and the schedule.
        </p>
      </header>

      <ol className={styles.beats}>
        {draft.map((beat, i) => (
          <li key={i} className={styles.beat}>
            <div className={styles.beatNo}>{i + 1}</div>
            <div className={styles.beatBody}>
              <input
                className={styles.beatTitle}
                value={beat.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Beat title"
              />
              <AutoGrowTextarea
                className={styles.beatMessage}
                value={beat.core_message}
                onChange={(e) => update(i, { core_message: e.target.value })}
                placeholder="Core message — the one platform-agnostic idea"
              />
              <AutoGrowTextarea
                className={styles.beatRationale}
                value={beat.rationale}
                onChange={(e) => update(i, { rationale: e.target.value })}
                placeholder="Rationale"
              />
              <label className={styles.threadToggle}>
                <input
                  type="checkbox"
                  checked={beat.prefer_thread}
                  onChange={(e) => update(i, { prefer_thread: e.target.checked })}
                />
                Prefer an X thread for this beat
              </label>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.schedule}>
        <span className={styles.kicker}>
          <ListOrdered size={14} strokeWidth={1.5} /> Schedule ({schedule.entries.length} variants)
        </span>
        <ul className={styles.agenda}>
          {schedule.entries.map((e, i) => (
            <li key={i} className={styles.agendaRow}>
              <span className={styles.agendaWhen}>{formatSlot(e.scheduled_for)}</span>
              <span className={styles.agendaBeat}>
                Beat {e.beat_sequence}
                {e.beat_title ? ` — ${e.beat_title}` : ''}
              </span>
              {e.slot_label && <span className={styles.agendaSlot}>{e.slot_label}</span>}
            </li>
          ))}
        </ul>
      </div>

      <GateActions
        isPending={isPending}
        submitted={submitted}
        showChange={showChange}
        setShowChange={setShowChange}
        instruction={instruction}
        setInstruction={setInstruction}
        approveLabel="Approve plan"
        changePlaceholder="What should Margot change about the beats? e.g. reorder so the strongest opens, add a beat on regulation."
        onApprove={approve}
        onRequestChange={() =>
          onSubmit(
            { decision: 'request_change', instruction: instruction.trim() },
            'On it — Margot is reworking the beats.',
          )
        }
      />
    </section>
  );
}

// ── Locked canvas ─────────────────────────────────────────────────────────────

function LockedCanvas({
  strategy,
  beats,
  schedule,
}: {
  strategy: Strategy | null;
  beats: BeatRow[];
  schedule: SchedulePlan | null;
}) {
  const s = strategy ? { ...EMPTY_STRATEGY, ...strategy } : null;
  return (
    <div className={styles.locked}>
      <div className={styles.lockedBanner}>
        <Lock size={16} strokeWidth={1.5} />
        The strategy and plan are locked. Major changes mean a new campaign.
      </div>

      {s && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Strategy</h2>
          <ReadList label="Content pillars" items={s.content_pillars} />
          <ReadList label="Key messages" items={s.key_messages} />
          {s.audience_summary && <ReadText label="Audience" text={s.audience_summary} />}
          {s.tone_guidance && <ReadText label="Tone" text={s.tone_guidance} />}
          <ReadList label="Do not say" items={s.do_not_say} />
        </section>
      )}

      {beats.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Beats</h2>
          <ol className={styles.beats}>
            {beats.map((b) => (
              <li key={b.id} className={styles.beat}>
                <div className={styles.beatNo}>{b.sequence}</div>
                <div className={styles.beatBody}>
                  {b.title && <span className={styles.beatReadTitle}>{b.title}</span>}
                  <p className={styles.beatReadMessage}>{b.core_message}</p>
                  {b.prefer_thread && <StatusChip label="X thread" color="neutral" />}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {schedule && schedule.entries.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Schedule</h2>
          <ul className={styles.agenda}>
            {schedule.entries.map((e, i) => (
              <li key={i} className={styles.agendaRow}>
                <span className={styles.agendaWhen}>{formatSlot(e.scheduled_for)}</span>
                <span className={styles.agendaBeat}>
                  Beat {e.beat_sequence}
                  {e.beat_title ? ` — ${e.beat_title}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <AutoGrowTextarea className={styles.textarea} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ReadList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.readBlock}>
      <span className={styles.fieldLabel}>{label}</span>
      <ul className={styles.readList}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ReadText({ label, text }: { label: string; text: string }) {
  return (
    <div className={styles.readBlock}>
      <span className={styles.fieldLabel}>{label}</span>
      <p className={styles.readText}>{text}</p>
    </div>
  );
}

function GateActions({
  isPending,
  submitted,
  showChange,
  setShowChange,
  instruction,
  setInstruction,
  approveLabel,
  changePlaceholder,
  onApprove,
  onRequestChange,
}: {
  isPending: boolean;
  submitted: boolean;
  showChange: boolean;
  setShowChange: (v: boolean) => void;
  instruction: string;
  setInstruction: (v: string) => void;
  approveLabel: string;
  changePlaceholder: string;
  onApprove: () => void;
  onRequestChange: () => void;
}) {
  if (submitted) {
    return (
      <div className={styles.working} role="status">
        <Loader size={18} strokeWidth={1.5} className={styles.spin} />
        <span>Sent to Margot. This page updates automatically once she has the next step ready.</span>
      </div>
    );
  }
  return (
    <>
      <div className={styles.actions}>
        <Button variant="primary" loading={isPending} onClick={onApprove}>
          <Check size={16} strokeWidth={1.5} />
          {approveLabel}
        </Button>
        <Button variant="secondary" disabled={isPending} onClick={() => setShowChange(!showChange)}>
          <RefreshCw size={16} strokeWidth={1.5} />
          Request a change
        </Button>
      </div>
      {showChange && (
        <div className={styles.changeForm}>
          <AutoGrowTextarea
            className={styles.textarea}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={changePlaceholder}
          />
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            disabled={instruction.trim().length === 0}
            onClick={onRequestChange}
          >
            <MessageSquare size={16} strokeWidth={1.5} />
            Send change
          </Button>
        </div>
      )}
    </>
  );
}
