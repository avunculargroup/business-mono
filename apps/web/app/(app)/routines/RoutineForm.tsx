'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AgentName, RoutineActionType, RoutineFrequency } from '@platform/shared';
import type {
  AgentName as AgentNameType,
  RoutineActionType as RoutineActionTypeT,
  RoutineFrequency as RoutineFrequencyT,
} from '@platform/shared';
import styles from './routines.module.css';

export interface RoutineFormValues {
  name: string;
  description: string;
  agent_name: string;
  action_type: RoutineActionTypeT;
  action_config: Record<string, unknown>;
  frequency: RoutineFrequencyT;
  time_of_day: string; // HH:MM
  timezone: string;
  show_on_dashboard: boolean;
  dashboard_title: string;
  is_active: boolean;
}

const DEFAULTS: RoutineFormValues = {
  name: '',
  description: '',
  agent_name: AgentName.REX,
  action_type: RoutineActionType.RESEARCH_DIGEST,
  action_config: { search_queries: [], archive_sources: false, max_sources: 10, subject: '', context: '' },
  frequency: RoutineFrequency.DAILY,
  time_of_day: '07:00',
  timezone: 'Australia/Melbourne',
  show_on_dashboard: false,
  dashboard_title: '',
  is_active: true,
};

const AGENT_OPTIONS: { value: AgentNameType; label: string; enabled: boolean }[] = [
  { value: AgentName.REX, label: 'Rex — Researcher', enabled: true },
  { value: AgentName.ARCHIE, label: 'Archie — Archivist (coming soon)', enabled: false },
  { value: AgentName.CHARLIE, label: 'Charlie — Content Creator (coming soon)', enabled: false },
  { value: AgentName.DELLA, label: 'Della — Relationship Manager (coming soon)', enabled: false },
  { value: AgentName.BRUNO, label: 'Bruno — BA (coming soon)', enabled: false },
  { value: AgentName.SIMON, label: 'Simon — Coordinator (coming soon)', enabled: false },
  { value: AgentName.ROGER, label: 'Roger (coming soon)', enabled: false },
  { value: AgentName.PETRA, label: 'Petra (coming soon)', enabled: false },
];

const TIMEZONE_OPTIONS = [
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Perth',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
];

interface RoutineFormProps {
  initialValues?: RoutineFormValues;
  onSubmit: (values: RoutineFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function RoutineForm({ initialValues, onSubmit, onCancel, submitting }: RoutineFormProps) {
  const [values, setValues] = useState<RoutineFormValues>(initialValues ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof RoutineFormValues>(key: K, value: RoutineFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const updateConfig = (patch: Record<string, unknown>) => {
    setValues((prev) => ({ ...prev, action_config: { ...prev.action_config, ...patch } }));
  };

  const changeActionType = (action_type: RoutineActionTypeT) => {
    setValues((prev) => ({
      ...prev,
      action_type,
      action_config:
        action_type === RoutineActionType.RESEARCH_DIGEST
          ? { subject: '', context: '', search_queries: [], archive_sources: false, max_sources: 10 }
          : { subject: '', context: '', search_queries: [], notify_signal: false, notify_agent: null },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!values.name.trim()) return setError('Name is required');
    const cfg = values.action_config as Record<string, unknown>;
    if (!String(cfg['subject'] ?? '').trim()) return setError('Subject is required');
    const queries = Array.isArray(cfg['search_queries']) ? (cfg['search_queries'] as string[]) : [];
    if (queries.length === 0) return setError('At least one search query is required');

    onSubmit(values);
  };

  const cfg = values.action_config as Record<string, unknown>;
  const searchQueriesText = Array.isArray(cfg['search_queries'])
    ? (cfg['search_queries'] as string[]).join('\n')
    : '';

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.formError}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Daily bitcoin headlines"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description (optional)</label>
        <textarea
          className={styles.textarea}
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          rows={2}
          placeholder="Morning briefing digest shown on the dashboard"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Agent</label>
          <select
            className={styles.input}
            value={values.agent_name}
            onChange={(e) => update('agent_name', e.target.value)}
          >
            {AGENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={!opt.enabled}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Action type</label>
          <select
            className={styles.input}
            value={values.action_type}
            onChange={(e) => changeActionType(e.target.value as RoutineActionTypeT)}
          >
            <option value={RoutineActionType.RESEARCH_DIGEST}>Research digest</option>
            <option value={RoutineActionType.MONITOR_CHANGE}>Monitor change</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Subject</label>
        <input
          className={styles.input}
          value={String(cfg['subject'] ?? '')}
          onChange={(e) => updateConfig({ subject: e.target.value })}
          placeholder="Daily Bitcoin headlines"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Context (optional)</label>
        <textarea
          className={styles.textarea}
          value={String(cfg['context'] ?? '')}
          onChange={(e) => updateConfig({ context: e.target.value })}
          rows={3}
          placeholder="Background or framing for the agent — e.g. focus on treasury news"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Search queries (one per line)</label>
        <textarea
          className={styles.textarea}
          value={searchQueriesText}
          onChange={(e) =>
            updateConfig({
              search_queries: e.target.value
                .split(/\n/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          rows={3}
          placeholder={'bitcoin news today\nBTC price'}
        />
      </div>

      {values.action_type === RoutineActionType.RESEARCH_DIGEST && (
        <>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Max sources</label>
              <input
                type="number"
                min={1}
                max={50}
                className={styles.input}
                value={Number(cfg['max_sources'] ?? 10)}
                onChange={(e) => updateConfig({ max_sources: Number(e.target.value) })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg['archive_sources'])}
                  onChange={(e) => updateConfig({ archive_sources: e.target.checked })}
                />
                <span>Archive sources to knowledge base</span>
              </label>
            </div>
          </div>
        </>
      )}

      {values.action_type === RoutineActionType.MONITOR_CHANGE && (
        <>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg['notify_signal'])}
                  onChange={(e) => updateConfig({ notify_signal: e.target.checked })}
                />
                <span>Notify via Signal on change</span>
              </label>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Notify agent (optional)</label>
              <select
                className={styles.input}
                value={(cfg['notify_agent'] as string | null) ?? ''}
                onChange={(e) => updateConfig({ notify_agent: e.target.value || null })}
              >
                <option value="">—</option>
                {AGENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label.split(' — ')[0]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Frequency</label>
          <div className={styles.radioGroup}>
            {[RoutineFrequency.DAILY, RoutineFrequency.WEEKLY, RoutineFrequency.FORTNIGHTLY].map((f) => (
              <label key={f} className={styles.radio}>
                <input
                  type="radio"
                  name="frequency"
                  value={f}
                  checked={values.frequency === f}
                  onChange={() => update('frequency', f)}
                />
                <span>{f.charAt(0).toUpperCase() + f.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Time of day</label>
          <input
            type="time"
            className={styles.input}
            value={values.time_of_day}
            onChange={(e) => update('time_of_day', e.target.value)}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Timezone</label>
        <select
          className={styles.input}
          value={values.timezone}
          onChange={(e) => update('timezone', e.target.value)}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={values.show_on_dashboard}
            onChange={(e) => update('show_on_dashboard', e.target.checked)}
          />
          <span>Show on dashboard</span>
        </label>
      </div>

      {values.show_on_dashboard && (
        <div className={styles.field}>
          <label className={styles.label}>Dashboard title (optional)</label>
          <input
            className={styles.input}
            value={values.dashboard_title}
            onChange={(e) => update('dashboard_title', e.target.value)}
            placeholder="Today in Bitcoin"
          />
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={values.is_active}
            onChange={(e) => update('is_active', e.target.checked)}
          />
          <span>Active</span>
        </label>
      </div>

      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initialValues ? 'Save changes' : 'Create routine'}
        </Button>
      </div>
    </form>
  );
}
