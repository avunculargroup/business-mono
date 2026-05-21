// Registry of model-configurable scopes (agents + workflow steps).
//
// The agent server uses these keys to look up overrides in `model_configs`;
// the web app uses the same registry to render the settings page so the two
// stay in sync. Adding an agent or AI-using workflow step? Add it here.

export type ModelScopeType = 'agent' | 'workflow_step';

export interface ModelScope {
  /** Canonical identifier used by `model_configs.scope_key`. */
  key: string;
  type: ModelScopeType;
  /** Display name shown in the settings UI. */
  label: string;
  /** One-line description shown beneath the label. */
  description: string;
  /**
   * For workflow_step scopes, the owning workflow id. Used to group steps
   * under their parent and to resolve the fallback chain (step → agent →
   * default).
   */
  workflow?: string;
  /**
   * For workflow_step scopes, the agent the step delegates to. When no
   * row exists for the step, the resolver falls back to this scope before
   * the env default.
   */
  fallbackAgent?: string;
}

export const MODEL_SCOPES: readonly ModelScope[] = [
  // ── Agents ────────────────────────────────────────────────────────────────
  { key: 'simon', type: 'agent', label: 'Simon', description: 'EA and central coordinator' },
  { key: 'roger', type: 'agent', label: 'Roger', description: 'Recorder — transcription and entity extraction' },
  { key: 'archie', type: 'agent', label: 'Archie', description: 'Archivist — knowledge base and search' },
  { key: 'petra', type: 'agent', label: 'Petra', description: 'PM — tasks, projects, risk' },
  { key: 'bruno', type: 'agent', label: 'Bruno', description: 'BA — requirements and clarification loops' },
  { key: 'charlie', type: 'agent', label: 'Charlie', description: 'Content creator' },
  { key: 'rex', type: 'agent', label: 'Rex', description: 'Researcher — web research and URL ingestion' },
  { key: 'della', type: 'agent', label: 'Della', description: 'Relationship manager — CRM hygiene' },

  // ── Recorder workflow steps ───────────────────────────────────────────────
  {
    key: 'recorder.identify_speakers',
    type: 'workflow_step',
    label: 'Identify speakers',
    description: 'Maps speaker channels to known team members and contacts',
    workflow: 'recorder',
    fallbackAgent: 'roger',
  },
  {
    key: 'recorder.extract_entities',
    type: 'workflow_step',
    label: 'Extract entities',
    description: 'Pulls decisions, action items, topics, sentiment from the transcript',
    workflow: 'recorder',
    fallbackAgent: 'roger',
  },
  {
    key: 'recorder.crm_match',
    type: 'workflow_step',
    label: 'CRM match',
    description: 'Matches extracted entities against existing contacts and companies',
    workflow: 'recorder',
    fallbackAgent: 'roger',
  },

  // ── PM workflow steps ─────────────────────────────────────────────────────
  {
    key: 'pm.triage_task',
    type: 'workflow_step',
    label: 'Triage task',
    description: 'Decides project, assignee, priority, due date for a new task',
    workflow: 'pm',
    fallbackAgent: 'petra',
  },
  {
    key: 'pm.risk_scan',
    type: 'workflow_step',
    label: 'Risk scan',
    description: 'Scans the task portfolio for risks after each task creation',
    workflow: 'pm',
    fallbackAgent: 'petra',
  },

  // ── Routine workflow steps ────────────────────────────────────────────────
  {
    key: 'executeRoutine.research_digest',
    type: 'workflow_step',
    label: 'Research digest',
    description: 'Scheduled research summaries via Rex',
    workflow: 'executeRoutine',
    fallbackAgent: 'rex',
  },
  {
    key: 'executeRoutine.monitor_change',
    type: 'workflow_step',
    label: 'Monitor change',
    description: 'Detects changes in monitored topics via Rex',
    workflow: 'executeRoutine',
    fallbackAgent: 'rex',
  },
  {
    key: 'executeRoutine.news_extractor',
    type: 'workflow_step',
    label: 'News extractor',
    description: 'Extracts summary, key points, topic tags from each news article',
    workflow: 'executeRoutine',
    fallbackAgent: 'rex',
  },
  {
    key: 'executeRoutine.news_judge',
    type: 'workflow_step',
    label: 'News judge',
    description: 'Ranks news candidates and selects a shortlist for each category',
    workflow: 'executeRoutine',
    fallbackAgent: 'rex',
  },
] as const;

export const WORKFLOW_LABELS: Record<string, string> = {
  recorder: 'Recorder',
  pm: 'PM',
  executeRoutine: 'Routines',
};

// Curated OpenRouter model suggestions surfaced in the settings UI. The text
// field stays free-form — anything OpenRouter accepts is valid.
export interface ModelOption {
  id: string;
  label: string;
}

export const POPULAR_MODELS: readonly ModelOption[] = [
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic)' },
  { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5 (Anthropic)' },
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Google)' },
] as const;
