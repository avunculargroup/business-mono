'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipField } from '@/components/ui/ChipField';
import {
  AgentName,
  RoutineActionType,
  RoutineFrequency,
  ROUTINE_ACTION_LABELS,
  DEFAULT_TIMEZONE,
  NewsCategory,
  NEWS_CATEGORY_LABELS,
  NewsRelevanceFilter,
  defaultRelevanceFilter,
} from '@platform/shared';
import type {
  AgentName as AgentNameType,
  RoutineActionType as RoutineActionTypeT,
  RoutineFrequency as RoutineFrequencyT,
  NewsCategory as NewsCategoryT,
  NewsRelevanceFilter as NewsRelevanceFilterT,
  NewsletterTimeRange,
} from '@platform/shared';
import styles from './routines.module.css';

const RELEVANCE_FILTER_LABELS: Record<NewsRelevanceFilterT, string> = {
  au_or_bitcoin: 'Australian or Bitcoin (default)',
  bitcoin: 'Bitcoin only',
  none: 'Keep all curated stories',
};

const TIME_RANGE_LABELS: Record<NewsletterTimeRange, string> = {
  week: 'Past week',
  fortnight: 'Past fortnight',
  month: 'Past month',
};

const SOCIAL_PLATFORMS: { value: 'linkedin' | 'twitter_x'; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter_x', label: 'X' },
];

export interface TeamMemberOption {
  id: string;
  full_name: string;
}

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

/**
 * Starting `action_config` for each action type, matching the defaults the
 * agent-side handlers fall back to. Every action type the workflow can execute
 * has an entry — a type missing here is a routine the form cannot create.
 */
function defaultConfigFor(actionType: RoutineActionTypeT): Record<string, unknown> {
  switch (actionType) {
    case RoutineActionType.RESEARCH_DIGEST:
      return { subject: '', context: '', search_queries: [], archive_sources: false, max_sources: 10 };
    case RoutineActionType.MONITOR_CHANGE:
      return { subject: '', context: '', search_queries: [], notify_signal: false, notify_agent: null };
    case RoutineActionType.NEWS_INGEST:
      return {
        category: NewsCategory.REGULATORY,
        queries: [],
        max_results_per_query: 15,
        max_curated: 6,
        relevance_filter: defaultRelevanceFilter(NewsCategory.REGULATORY),
      };
    case RoutineActionType.NEWS_SOURCE_SCAN:
      return { max_items_per_source: 10, lookback_days: 3 };
    case RoutineActionType.NEWS_CURATION:
      return { max_stories: 6, lookback_hours: 24 };
    case RoutineActionType.PODCAST_INGEST:
      return { max_items_per_source: 25, lookback_days: 14 };
    case RoutineActionType.NEWSLETTER:
      return { time_range: 'month', story_count: 5, target_word_count: 250, audience_context: '', monthly_guard: false };
    case RoutineActionType.SOCIAL_POST_FROM_NEWS:
      return { founder_team_member_id: '', platforms: ['linkedin', 'twitter_x'], lookback_hours: 24 };
    case RoutineActionType.INDICATOR_POLL:
      return { backfill_periods: 18 };
    case RoutineActionType.ONCHAIN_POLL:
      return { backfill_days: 90 };
    case RoutineActionType.REPORT_WATCH_SCAN:
      return { max_acquisitions_per_run: 10 };
    case RoutineActionType.MARKET_REPORT:
      return {};
  }
}

const DEFAULTS: RoutineFormValues = {
  name: '',
  description: '',
  agent_name: AgentName.REX,
  action_type: RoutineActionType.RESEARCH_DIGEST,
  action_config: defaultConfigFor(RoutineActionType.RESEARCH_DIGEST),
  frequency: RoutineFrequency.DAILY,
  time_of_day: '07:00',
  timezone: DEFAULT_TIMEZONE,
  show_on_dashboard: false,
  dashboard_title: '',
  is_active: true,
};

const AGENT_OPTIONS: { value: AgentNameType; label: string; enabled: boolean }[] = [
  { value: AgentName.REX, label: 'Rex — Researcher', enabled: true },
  { value: AgentName.SIMON, label: 'Simon — Coordinator', enabled: true },
  { value: AgentName.CHARLIE, label: 'Charlie — Content Creator', enabled: true },
  { value: AgentName.ARCHIE, label: 'Archie — Archivist', enabled: true },
  { value: AgentName.DELLA, label: 'Della — Relationship Manager (coming soon)', enabled: false },
  { value: AgentName.BRUNO, label: 'Bruno — BA (coming soon)', enabled: false },
  { value: AgentName.ROGER, label: 'Roger (coming soon)', enabled: false },
  { value: AgentName.PETRA, label: 'Petra (coming soon)', enabled: false },
];

const ACTION_TYPE_OPTIONS = (Object.values(RoutineActionType) as RoutineActionTypeT[]).map((value) => ({
  value,
  label: ROUTINE_ACTION_LABELS[value],
}));

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

/**
 * Numeric fields are held as the raw input string so a field can be cleared
 * mid-edit without snapping to 0. Blank (or unparseable) resolves to the
 * action's default at submit rather than being persisted as zero.
 */
function numOr(value: unknown, fallback: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

interface RoutineFormProps {
  initialValues?: RoutineFormValues;
  teamMembers?: TeamMemberOption[];
  onSubmit: (values: RoutineFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function RoutineForm({
  initialValues,
  teamMembers = [],
  onSubmit,
  onCancel,
  submitting,
}: RoutineFormProps) {
  const [values, setValues] = useState<RoutineFormValues>(initialValues ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [searchQueriesText, setSearchQueriesText] = useState<string>(() => {
    const initCfg = (initialValues ?? DEFAULTS).action_config as Record<string, unknown>;
    return stringArray(initCfg['search_queries']).join('\n');
  });

  const update = <K extends keyof RoutineFormValues>(key: K, value: RoutineFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const updateConfig = (patch: Record<string, unknown>) => {
    setValues((prev) => ({ ...prev, action_config: { ...prev.action_config, ...patch } }));
  };

  const changeActionType = (action_type: RoutineActionTypeT) => {
    setSearchQueriesText('');
    setValues((prev) => ({ ...prev, action_type, action_config: defaultConfigFor(action_type) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!values.name.trim()) return setError('Name is required');
    const cfg = values.action_config as Record<string, unknown>;
    const submitWith = (action_config: Record<string, unknown>) => onSubmit({ ...values, action_config });

    switch (values.action_type) {
      case RoutineActionType.NEWS_INGEST: {
        const queries = stringArray(cfg['queries']).map((q) => q.trim()).filter(Boolean);
        if (!cfg['category']) return setError('Category is required');
        if (queries.length === 0) return setError('Add at least one search query');
        const max = numOr(cfg['max_results_per_query'], 15);
        const cap = numOr(cfg['max_curated'], 6);
        if (cap > max * queries.length) {
          return setError('Curated cap cannot exceed results per query × number of queries');
        }
        return submitWith({
          category: cfg['category'],
          queries,
          max_results_per_query: max,
          max_curated: cap,
          relevance_filter:
            (cfg['relevance_filter'] as NewsRelevanceFilterT | undefined) ??
            defaultRelevanceFilter(cfg['category'] as NewsCategoryT),
        });
      }

      case RoutineActionType.NEWS_SOURCE_SCAN:
        return submitWith({
          max_items_per_source: numOr(cfg['max_items_per_source'], 10),
          lookback_days: numOr(cfg['lookback_days'], 3),
        });

      case RoutineActionType.NEWS_CURATION:
        return submitWith({
          max_stories: numOr(cfg['max_stories'], 6),
          lookback_hours: numOr(cfg['lookback_hours'], 24),
          more_news_url: String(cfg['more_news_url'] ?? '/news'),
        });

      case RoutineActionType.PODCAST_INGEST:
        return submitWith({
          max_items_per_source: numOr(cfg['max_items_per_source'], 25),
          lookback_days: numOr(cfg['lookback_days'], 14),
        });

      case RoutineActionType.NEWSLETTER: {
        const storyCount = numOr(cfg['story_count'], 5);
        if (storyCount < 3 || storyCount > 8) return setError('Story count must be between 3 and 8');
        return submitWith({
          time_range: cfg['time_range'] ?? 'month',
          story_count: storyCount,
          target_word_count: numOr(cfg['target_word_count'], 250),
          audience_context: String(cfg['audience_context'] ?? ''),
          monthly_guard: Boolean(cfg['monthly_guard']),
          // Set by the seed for the /content page's on-demand routine. Not
          // editable here, but dropping it would turn a one-shot into a weekly.
          one_off: Boolean(cfg['one_off']),
        });
      }

      case RoutineActionType.SOCIAL_POST_FROM_NEWS: {
        const founder = String(cfg['founder_team_member_id'] ?? '').trim();
        const platforms = stringArray(cfg['platforms']);
        if (!founder) return setError('Pick the founder these posts are for');
        if (platforms.length === 0) return setError('Pick at least one platform');
        return submitWith({
          founder_team_member_id: founder,
          platforms,
          lookback_hours: numOr(cfg['lookback_hours'], 24),
        });
      }

      case RoutineActionType.INDICATOR_POLL:
        return submitWith({ backfill_periods: numOr(cfg['backfill_periods'], 18) });

      case RoutineActionType.ONCHAIN_POLL:
        return submitWith({ backfill_days: numOr(cfg['backfill_days'], 90) });

      case RoutineActionType.REPORT_WATCH_SCAN:
        return submitWith({ max_acquisitions_per_run: numOr(cfg['max_acquisitions_per_run'], 10) });

      case RoutineActionType.MARKET_REPORT:
        return submitWith({});

      case RoutineActionType.RESEARCH_DIGEST:
      case RoutineActionType.MONITOR_CHANGE: {
        if (!String(cfg['subject'] ?? '').trim()) return setError('Subject is required');
        const queries = searchQueriesText.split('\n').map((s) => s.trim()).filter(Boolean);
        if (queries.length === 0) return setError('At least one search query is required');

        if (values.action_type === RoutineActionType.RESEARCH_DIGEST) {
          return submitWith({
            subject: String(cfg['subject'] ?? ''),
            context: String(cfg['context'] ?? ''),
            search_queries: queries,
            archive_sources: Boolean(cfg['archive_sources']),
            max_sources: numOr(cfg['max_sources'], 10),
          });
        }
        return submitWith({
          subject: String(cfg['subject'] ?? ''),
          context: String(cfg['context'] ?? ''),
          search_queries: queries,
          notify_signal: Boolean(cfg['notify_signal']),
          notify_agent: (cfg['notify_agent'] as string | null) || null,
          // The change-detection baseline from the last run. Invisible here, but
          // dropping it makes the next run report "no prior digest" and lose the
          // comparison the routine exists to make.
          last_digest: (cfg['last_digest'] as string | null) ?? null,
        });
      }
    }
  };

  const cfg = values.action_config as Record<string, unknown>;
  const togglePlatform = (platform: string, checked: boolean) => {
    const current = stringArray(cfg['platforms']);
    updateConfig({
      platforms: checked ? [...new Set([...current, platform])] : current.filter((p) => p !== platform),
    });
  };

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
            {ACTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(values.action_type === RoutineActionType.RESEARCH_DIGEST ||
        values.action_type === RoutineActionType.MONITOR_CHANGE) && (
        <>
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
              onChange={(e) => setSearchQueriesText(e.target.value)}
              rows={3}
              placeholder={'bitcoin news today\nBTC price'}
            />
          </div>
        </>
      )}

      {values.action_type === RoutineActionType.NEWS_INGEST && (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Category</label>
            <select
              className={styles.input}
              value={(cfg['category'] as string | undefined) ?? NewsCategory.REGULATORY}
              onChange={(e) => updateConfig({ category: e.target.value as NewsCategoryT })}
            >
              {(Object.values(NewsCategory) as NewsCategoryT[]).map((c) => (
                <option key={c} value={c}>
                  {NEWS_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Relevance filter</label>
            <select
              className={styles.input}
              value={(cfg['relevance_filter'] as string | undefined) ?? defaultRelevanceFilter((cfg['category'] as NewsCategoryT | undefined) ?? NewsCategory.REGULATORY)}
              onChange={(e) => updateConfig({ relevance_filter: e.target.value as NewsRelevanceFilterT })}
            >
              {(Object.values(NewsRelevanceFilter) as NewsRelevanceFilterT[]).map((f) => (
                <option key={f} value={f}>
                  {RELEVANCE_FILTER_LABELS[f]}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Stories failing this check are dropped after curation. Use “Keep all curated stories” for macro feeds that needn’t be Australian or Bitcoin specific.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Search queries</label>
            <ChipField
              value={stringArray(cfg['queries'])}
              onChange={(next) => updateConfig({ queries: next })}
              placeholder="e.g. ASIC Bitcoin regulation Australia 2026"
              addOnBlur
            />
            <span className={styles.hint}>
              One query per chip. Press Enter to add. 2–4 angles per category works well.
            </span>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Results per query</label>
              <input
                type="number"
                min={5}
                max={20}
                className={styles.input}
                value={String(cfg['max_results_per_query'] ?? 15)}
                onChange={(e) => updateConfig({ max_results_per_query: e.target.value })}
              />
              <span className={styles.hint}>
                Raw articles Tavily returns per query before curation.
              </span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Curated cap</label>
              <input
                type="number"
                min={1}
                max={10}
                className={styles.input}
                value={String(cfg['max_curated'] ?? 6)}
                onChange={(e) => updateConfig({ max_curated: e.target.value })}
              />
              <span className={styles.hint}>
                Top stories the LLM judge keeps. The rest are discarded.
              </span>
            </div>
          </div>
        </>
      )}

      {values.action_type === RoutineActionType.NEWS_SOURCE_SCAN && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Items per source</label>
            <input
              type="number"
              min={1}
              max={100}
              className={styles.input}
              value={String(cfg['max_items_per_source'] ?? 10)}
              onChange={(e) => updateConfig({ max_items_per_source: e.target.value })}
            />
            <span className={styles.hint}>Feed items considered per active RSS source each run.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Lookback (days)</label>
            <input
              type="number"
              min={1}
              max={30}
              className={styles.input}
              value={String(cfg['lookback_days'] ?? 3)}
              onChange={(e) => updateConfig({ lookback_days: e.target.value })}
            />
            <span className={styles.hint}>
              Articles published before this are skipped. Sources are managed on the news sources page.
            </span>
          </div>
        </div>
      )}

      {values.action_type === RoutineActionType.NEWS_CURATION && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Max stories</label>
            <input
              type="number"
              min={1}
              max={6}
              className={styles.input}
              value={String(cfg['max_stories'] ?? 6)}
              onChange={(e) => updateConfig({ max_stories: e.target.value })}
            />
            <span className={styles.hint}>Items featured on the dashboard tile (up to 6).</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Lookback (hours)</label>
            <input
              type="number"
              min={6}
              max={72}
              className={styles.input}
              value={String(cfg['lookback_hours'] ?? 24)}
              onChange={(e) => updateConfig({ lookback_hours: e.target.value })}
            />
            <span className={styles.hint}>
              How far back to pull news and podcast episodes from.
            </span>
          </div>
        </div>
      )}

      {values.action_type === RoutineActionType.PODCAST_INGEST && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Items per source</label>
            <input
              type="number"
              min={1}
              max={100}
              className={styles.input}
              value={String(cfg['max_items_per_source'] ?? 25)}
              onChange={(e) => updateConfig({ max_items_per_source: e.target.value })}
            />
            <span className={styles.hint}>
              Feed items considered per podcast source each run.
            </span>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Lookback (days)</label>
            <input
              type="number"
              min={1}
              max={90}
              className={styles.input}
              value={String(cfg['lookback_days'] ?? 14)}
              onChange={(e) => updateConfig({ lookback_days: e.target.value })}
            />
            <span className={styles.hint}>
              Episodes published before this are skipped. Per-feed settings live on the source.
            </span>
          </div>
        </div>
      )}

      {values.action_type === RoutineActionType.NEWSLETTER && (
        <>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Content window</label>
              <select
                className={styles.input}
                value={String(cfg['time_range'] ?? 'month')}
                onChange={(e) => updateConfig({ time_range: e.target.value as NewsletterTimeRange })}
              >
                {(Object.keys(TIME_RANGE_LABELS) as NewsletterTimeRange[]).map((r) => (
                  <option key={r} value={r}>
                    {TIME_RANGE_LABELS[r]}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>How far back the story retrieval reaches.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Stories</label>
              <input
                type="number"
                min={3}
                max={8}
                className={styles.input}
                value={String(cfg['story_count'] ?? 5)}
                onChange={(e) => updateConfig({ story_count: e.target.value })}
              />
              <span className={styles.hint}>Between 3 and 8.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Words per story</label>
            <input
              type="number"
              min={100}
              max={800}
              className={styles.input}
              value={String(cfg['target_word_count'] ?? 250)}
              onChange={(e) => updateConfig({ target_word_count: e.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Audience context (optional)</label>
            <textarea
              className={styles.textarea}
              value={String(cfg['audience_context'] ?? '')}
              onChange={(e) => updateConfig({ audience_context: e.target.value })}
              rows={2}
              placeholder="Who this issue is written for — e.g. CFOs at mid-market Australian firms"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={Boolean(cfg['monthly_guard'])}
                onChange={(e) => updateConfig({ monthly_guard: e.target.checked })}
              />
              <span>Only run on the first Monday of the month</span>
            </label>
            <span className={styles.hint}>
              Keeps a weekly schedule down to one issue a month, and skips if an issue already ran.
            </span>
          </div>
        </>
      )}

      {values.action_type === RoutineActionType.SOCIAL_POST_FROM_NEWS && (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Founder</label>
            <select
              className={styles.input}
              value={String(cfg['founder_team_member_id'] ?? '')}
              onChange={(e) => updateConfig({ founder_team_member_id: e.target.value })}
            >
              <option value="">Select a founder…</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Posts are drafted in this person’s voice and emailed to them for review.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Platforms</label>
            <div className={styles.radioGroup}>
              {SOCIAL_PLATFORMS.map((p) => (
                <label key={p.value} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={stringArray(cfg['platforms']).includes(p.value)}
                    onChange={(e) => togglePlatform(p.value, e.target.checked)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Lookback (hours)</label>
            <input
              type="number"
              min={6}
              max={72}
              className={styles.input}
              value={String(cfg['lookback_hours'] ?? 24)}
              onChange={(e) => updateConfig({ lookback_hours: e.target.value })}
            />
            <span className={styles.hint}>How far back to look for a story worth posting about.</span>
          </div>
        </>
      )}

      {values.action_type === RoutineActionType.INDICATOR_POLL && (
        <div className={styles.field}>
          <label className={styles.label}>Backfill periods</label>
          <input
            type="number"
            min={1}
            max={120}
            className={styles.input}
            value={String(cfg['backfill_periods'] ?? 18)}
            onChange={(e) => updateConfig({ backfill_periods: e.target.value })}
          />
          <span className={styles.hint}>
            History pulled the first time an indicator is seen, so year-on-year and the sparkline
            aren’t empty on day one. 12–24 is the usual range.
          </span>
        </div>
      )}

      {values.action_type === RoutineActionType.ONCHAIN_POLL && (
        <div className={styles.field}>
          <label className={styles.label}>Backfill days</label>
          <input
            type="number"
            min={1}
            max={3650}
            className={styles.input}
            value={String(cfg['backfill_days'] ?? 90)}
            onChange={(e) => updateConfig({ backfill_days: e.target.value })}
          />
          <span className={styles.hint}>
            History pulled the first time an indicator is seen. Hash Ribbons needs 60 days of hash
            rate before it can be computed.
          </span>
        </div>
      )}

      {values.action_type === RoutineActionType.REPORT_WATCH_SCAN && (
        <div className={styles.field}>
          <label className={styles.label}>Acquisitions per run</label>
          <input
            type="number"
            min={1}
            max={100}
            className={styles.input}
            value={String(cfg['max_acquisitions_per_run'] ?? 10)}
            onChange={(e) => updateConfig({ max_acquisitions_per_run: e.target.value })}
          />
          <span className={styles.hint}>
            Cap on reports downloaded across all watched sources each run. Sources are managed on the
            news sources page.
          </span>
        </div>
      )}

      {values.action_type === RoutineActionType.MARKET_REPORT && (
        <div className={styles.field}>
          <span className={styles.hint}>
            No settings — the report covers every displayed on-chain metric and every active macro
            indicator, and emails the team.
          </span>
        </div>
      )}

      {values.action_type === RoutineActionType.RESEARCH_DIGEST && (
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Max sources</label>
            <input
              type="number"
              min={1}
              max={50}
              className={styles.input}
              value={String(cfg['max_sources'] ?? 10)}
              onChange={(e) => updateConfig({ max_sources: e.target.value })}
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
      )}

      {values.action_type === RoutineActionType.MONITOR_CHANGE && (
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
