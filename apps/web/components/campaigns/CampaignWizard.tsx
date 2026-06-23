'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, X } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { createCampaignDraft, launchCampaignStrategy } from '@/app/actions/campaigns';
import styles from './CampaignWizard.module.css';

// The creation wizard: objective & audience (creates a draft) → accounts &
// cadence (saves config and launches the strategy workflow). Strategy review
// (Gate 1) and plan review (Gate 2) happen on the campaign detail page once the
// agents server has run Margot and suspended. Mobile-friendly: the wizard is
// linear and stacks naturally.

export interface WizardAccount {
  id: string;
  platform: 'linkedin' | 'twitter_x';
  account_type: string | null;
  display_name: string | null;
}

const DAYS: Array<{ code: string; label: string }> = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
];

const LITERACY = ['beginner', 'intermediate', 'advanced'];

interface Slot {
  day: string;
  time: string;
  label: string;
}

const STEPS = ['Objective & audience', 'Accounts & cadence'];

function csvToArray(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CampaignWizard({ accounts }: { accounts: WizardAccount[] }) {
  const router = useRouter();
  const { error } = useToast();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [industry, setIndustry] = useState('');
  const [pipelineStage, setPipelineStage] = useState('');
  const [literacy, setLiteracy] = useState('');
  const [persona, setPersona] = useState('');

  // Step 2
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [postsPerWeek, setPostsPerWeek] = useState(4);
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [startDate, setStartDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([{ day: 'TU', time: '09:00', label: 'Tuesday morning' }]);

  const toggleAccount = (id: string) =>
    setAccountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addSlot = () => setSlots((prev) => [...prev, { day: 'TH', time: '09:00', label: '' }]);
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const submitStep1 = () => {
    startTransition(async () => {
      const result = await createCampaignDraft({
        name: name.trim(),
        objective: objective.trim(),
        audienceFilter: {
          industry: csvToArray(industry),
          pipeline_stage: csvToArray(pipelineStage),
          ...(literacy ? { bitcoin_literacy_min: literacy } : {}),
        },
        audiencePersona: persona.trim() || undefined,
      });
      if (result.error || !result.id) {
        error(result.error ?? 'Could not create the campaign.');
        return;
      }
      setCampaignId(result.id);
      setStep(1);
    });
  };

  const submitStep2 = () => {
    if (!campaignId) return;
    startTransition(async () => {
      const result = await launchCampaignStrategy(campaignId, {
        accountIds,
        postsPerWeek,
        slots: slots.map((s) => ({ day: s.day, time: s.time, label: s.label.trim() || undefined })),
        durationWeeks,
        startDate,
      });
      if (result.error) {
        error(result.error);
        return;
      }
      // Margot now synthesises the strategy; the detail page renders Gate 1.
      router.push(`/campaigns/${campaignId}`);
    });
  };

  return (
    <div className={styles.wrap}>
      <ol className={styles.steps} aria-label="Campaign creation steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`${styles.step} ${i === step ? styles.active : ''} ${i < step ? styles.done : ''}`}
          >
            <span className={styles.stepDot}>{i < step ? <Check size={14} strokeWidth={2} /> : i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className={styles.panel} aria-label="Objective and audience">
          <label className={styles.field}>
            <span className={styles.label}>Campaign name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Treasury volatility series"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Objective</span>
            <textarea
              className={styles.textarea}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="What this campaign should achieve — e.g. reframe volatility as not the same as risk on a treasury horizon."
            />
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Industry</span>
              <input
                className={styles.input}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Asset Management, Family Office"
              />
              <span className={styles.hint}>Comma-separated</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Pipeline stage</span>
              <input
                className={styles.input}
                value={pipelineStage}
                onChange={(e) => setPipelineStage(e.target.value)}
                placeholder="warm, active"
              />
              <span className={styles.hint}>Comma-separated</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Bitcoin literacy (min)</span>
              <select className={styles.input} value={literacy} onChange={(e) => setLiteracy(e.target.value)}>
                <option value="">Any</option>
                {LITERACY.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Audience persona</span>
            <textarea
              className={styles.textarea}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={2}
              placeholder="AU CFOs and finance leads at asset managers and family offices, intermediate Bitcoin literacy."
            />
          </label>

          <div className={styles.actions}>
            <Button
              variant="primary"
              loading={isPending}
              disabled={!name.trim() || !objective.trim()}
              onClick={submitStep1}
            >
              Save and continue
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className={styles.panel} aria-label="Accounts and cadence">
          <div className={styles.field}>
            <span className={styles.label}>Participating accounts</span>
            {accounts.length === 0 ? (
              <p className={styles.hint}>
                No social accounts are set up yet. Add them in Brand Hub before launching a campaign.
              </p>
            ) : (
              <div className={styles.accountGrid}>
                {accounts.map((a) => {
                  const checked = accountIds.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className={`${styles.account} ${checked ? styles.accountOn : ''}`}
                      onClick={() => toggleAccount(a.id)}
                      aria-pressed={checked}
                    >
                      <span className={styles.accountName}>{a.display_name ?? 'Account'}</span>
                      <span className={styles.accountPlatform}>
                        {a.platform === 'twitter_x' ? 'X' : 'LinkedIn'}
                        {a.account_type ? ` · ${a.account_type}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Posts per week (total)</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={50}
                value={postsPerWeek}
                onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              />
              <span className={styles.hint}>Across all accounts</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Duration (weeks)</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={52}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Start date</span>
              <input
                className={styles.input}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Posting slots</span>
            <div className={styles.slots}>
              {slots.map((slot, i) => (
                <div key={i} className={styles.slot}>
                  <select
                    className={styles.slotDay}
                    value={slot.day}
                    onChange={(e) => updateSlot(i, { day: e.target.value })}
                    aria-label="Day"
                  >
                    {DAYS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.slotTime}
                    type="time"
                    value={slot.time}
                    onChange={(e) => updateSlot(i, { time: e.target.value })}
                    aria-label="Time"
                  />
                  <input
                    className={styles.slotLabel}
                    value={slot.label}
                    onChange={(e) => updateSlot(i, { label: e.target.value })}
                    placeholder="Label (optional)"
                  />
                  {slots.length > 1 && (
                    <button
                      type="button"
                      className={styles.slotRemove}
                      onClick={() => removeSlot(i)}
                      aria-label="Remove slot"
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className={styles.addSlot} onClick={addSlot}>
              <Plus size={16} strokeWidth={1.5} />
              Add slot
            </button>
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" disabled={isPending} onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              variant="primary"
              loading={isPending}
              disabled={accountIds.length === 0 || slots.length === 0 || !startDate}
              onClick={submitStep2}
            >
              Generate strategy
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
