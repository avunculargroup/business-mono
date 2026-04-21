import type { AgentName } from './types.js';
import type { ResearchSource } from './types.js';

// Schedule cadence for a routine.
export const RoutineFrequency = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  FORTNIGHTLY: 'fortnightly',
} as const;
export type RoutineFrequency = (typeof RoutineFrequency)[keyof typeof RoutineFrequency];

// What kind of work a routine performs.
//  - research_digest: Rex pulls the latest on a topic; full digest is surfaced.
//  - monitor_change: Rex detects whether the topic's state has changed vs last run.
export const RoutineActionType = {
  RESEARCH_DIGEST: 'research_digest',
  MONITOR_CHANGE: 'monitor_change',
} as const;
export type RoutineActionType = (typeof RoutineActionType)[keyof typeof RoutineActionType];

export const RoutineStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RUNNING: 'running',
} as const;
export type RoutineStatus = (typeof RoutineStatus)[keyof typeof RoutineStatus];

export interface ResearchDigestConfig {
  subject: string;
  context?: string;
  search_queries: string[];
  archive_sources: boolean;
  max_sources?: number;
}

export interface MonitorChangeConfig {
  subject: string;
  context?: string;
  search_queries: string[];
  notify_signal: boolean;
  notify_agent?: string | null;
  last_digest?: string | null;
}

export type RoutineActionConfig =
  | ({ action_type: typeof RoutineActionType.RESEARCH_DIGEST } & ResearchDigestConfig)
  | ({ action_type: typeof RoutineActionType.MONITOR_CHANGE } & MonitorChangeConfig);

// Shape persisted in routines.last_result. Action-agnostic so the dashboard tile
// can render any routine's output uniformly.
export interface RoutineResult {
  summary?: string;
  digest?: string;
  sources: ResearchSource[];
  metadata?: Record<string, unknown>;
}

export interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  agent_name: AgentName;
  action_type: RoutineActionType;
  action_config: Record<string, unknown>;
  frequency: RoutineFrequency;
  time_of_day: string;
  timezone: string;
  next_run_at: string;
  last_run_at: string | null;
  last_result: RoutineResult | null;
  last_status: RoutineStatus | null;
  last_error: string | null;
  show_on_dashboard: boolean;
  dashboard_title: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
