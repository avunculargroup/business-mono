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
  {
    key: 'editor',
    type: 'agent',
    label: 'Editor',
    description: 'Newsletter copy editor — brand-voice and audience-fit gate (internal to the newsletter workflow)',
  },
  {
    key: 'margot',
    type: 'agent',
    label: 'Margot',
    description: 'Marketer — campaign strategy and beat planning (campaigns workflow)',
  },
  {
    key: 'lex',
    type: 'agent',
    label: 'Lex',
    description: 'Compliance reviewer — flags advice-framed content (AFSL/AR) on draft persistence',
  },
  {
    key: 'marketAnalyst',
    type: 'agent',
    label: 'Market analyst',
    description: 'Writes the daily market report intro from on-chain + macro trends (internal to the market_report routine)',
  },
  {
    key: 'newsVerifier',
    type: 'agent',
    label: 'News verifier',
    description: 'Fact-checks the daily news digest intro against the curated stories (internal to the news_curation routine)',
  },

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
  {
    key: 'executeRoutine.news_rubric_score',
    type: 'workflow_step',
    label: 'News relevance rubric',
    description: 'Rex scores an ingested item on material/novelty/citation and drafts summary + curator notes (shared by email and feed ingestion)',
    workflow: 'executeRoutine',
    fallbackAgent: 'rex',
  },
  {
    key: 'executeRoutine.news_curation_select',
    type: 'workflow_step',
    label: 'News curation — select',
    description: 'Editor selects and ranks the best ≤6 stories across news and podcasts',
    workflow: 'executeRoutine',
    fallbackAgent: 'editor',
  },
  {
    key: 'executeRoutine.news_curation_summary',
    type: 'workflow_step',
    label: 'News curation — mood summary',
    description: 'Charlie writes the one-sentence mood/topic summary for the curated set',
    workflow: 'executeRoutine',
    fallbackAgent: 'charlie',
  },
  {
    key: 'executeRoutine.news_curation_verify',
    type: 'workflow_step',
    label: 'News curation — verify intro',
    description: 'Fact-checks the drafted digest intro against the stories\' key facts and rewrites unsupported claims',
    workflow: 'executeRoutine',
    fallbackAgent: 'newsVerifier',
  },

  // ── Newsletter workflow steps ─────────────────────────────────────────────
  {
    key: 'newsletter.story_selection',
    type: 'workflow_step',
    label: 'Story selection',
    description: 'Rex clusters retrieved content into a ranked newsletter story shortlist',
    workflow: 'newsletter',
    fallbackAgent: 'rex',
  },
  {
    key: 'newsletter.story_rerank',
    type: 'workflow_step',
    label: 'Story re-rank',
    description: 'Rex revises the shortlist after human swap/adjust feedback at gate 1',
    workflow: 'newsletter',
    fallbackAgent: 'rex',
  },
  {
    key: 'newsletter.research_enrich',
    type: 'workflow_step',
    label: 'Research enrichment',
    description: 'Rex supplements thin stories with external research before drafting',
    workflow: 'newsletter',
    fallbackAgent: 'rex',
  },
  {
    key: 'newsletter.draft_generation',
    type: 'workflow_step',
    label: 'Draft generation',
    description: 'Charlie drafts each newsletter story plus the intro and outro',
    workflow: 'newsletter',
    fallbackAgent: 'charlie',
  },
  {
    key: 'newsletter.editorial_review',
    type: 'workflow_step',
    label: 'Editorial review',
    description: 'A separate editorial agent scores each draft against brand voice',
    workflow: 'newsletter',
    fallbackAgent: 'editor',
  },

  // ── Variant generation workflow steps ─────────────────────────────────────
  {
    key: 'variant.generate_copy',
    type: 'workflow_step',
    label: 'Generate copy',
    description: 'Charlie writes platform-conformant copy for one campaign variant',
    workflow: 'variant',
    fallbackAgent: 'charlie',
  },
  {
    key: 'variant.compliance_check',
    type: 'workflow_step',
    label: 'Compliance check',
    description: 'Lex classifies advice risk and decides on a disclaimer for the variant',
    workflow: 'variant',
    fallbackAgent: 'lex',
  },

  // ── Campaign strategy workflow steps ──────────────────────────────────────
  {
    key: 'strategy.research',
    type: 'workflow_step',
    label: 'Strategy research',
    description: 'Rex gathers current context (trends, competitors, regulation) for the campaign — optional branch',
    workflow: 'strategy',
    fallbackAgent: 'rex',
  },
  {
    key: 'strategy.audience',
    type: 'workflow_step',
    label: 'Audience analysis',
    description: 'Bruno characterises the audience segment (pain points, framing) for the campaign — optional branch',
    workflow: 'strategy',
    fallbackAgent: 'bruno',
  },
  {
    key: 'strategy.synthesise',
    type: 'workflow_step',
    label: 'Strategy synthesis',
    description: 'Margot turns a campaign objective + audience + voice into a structured strategy',
    workflow: 'strategy',
    fallbackAgent: 'margot',
  },
  {
    key: 'strategy.plan_beats',
    type: 'workflow_step',
    label: 'Beat planning',
    description: 'Margot plans the ordered, platform-agnostic beats for the campaign',
    workflow: 'strategy',
    fallbackAgent: 'margot',
  },

  // ── Social-post-from-news routine steps ───────────────────────────────────
  {
    key: 'social_post.editor_select',
    type: 'workflow_step',
    label: 'Story & form selection',
    description: 'The editor picks the news story that best fits a founder\'s voice and the post form',
    workflow: 'social_post',
    fallbackAgent: 'editor',
  },
  {
    key: 'social_post.generate_copy',
    type: 'workflow_step',
    label: 'Generate copy',
    description: 'Charlie drafts a LinkedIn/X post from a news story in the founder\'s voice',
    workflow: 'social_post',
    fallbackAgent: 'charlie',
  },
  {
    key: 'social_post.compliance_check',
    type: 'workflow_step',
    label: 'Compliance check',
    description: 'Lex classifies advice risk and decides on a disclaimer for the founder post',
    workflow: 'social_post',
    fallbackAgent: 'lex',
  },
  {
    key: 'social_post.distill_feedback',
    type: 'workflow_step',
    label: 'Distill feedback guidelines',
    description: 'The editor folds founder review feedback into the account\'s standing guideline list',
    workflow: 'social_post',
    fallbackAgent: 'editor',
  },

  // ── Content compliance review (Lex, on draft persistence) ──────────────────
  {
    key: 'content.compliance_review',
    type: 'workflow_step',
    label: 'Compliance review',
    description: 'Lex reviews a persisted draft for advice risk (buy/sell framing, price prediction)',
    fallbackAgent: 'lex',
  },

  // ── Market report findings narration ───────────────────────────────────────
  {
    key: 'market_report.narrate',
    type: 'workflow_step',
    label: 'Findings narration',
    description: 'The market analyst narrates the day\'s selected deterministic findings into the report lead commentary',
    workflow: 'market_report',
    fallbackAgent: 'marketAnalyst',
  },
  {
    key: 'market_report.compliance_review',
    type: 'workflow_step',
    label: 'Narration compliance review',
    description: 'Lex reviews the findings narration for valuation/advice framing before it is emailed',
    workflow: 'market_report',
    fallbackAgent: 'lex',
  },
  {
    key: 'market_report.distill_feedback',
    type: 'workflow_step',
    label: 'Distill report feedback',
    description: 'The editor folds founder feedback on market reports into standing narration guidelines',
    workflow: 'market_report',
    fallbackAgent: 'editor',
  },

  // ── Podcast transcript processing ──────────────────────────────────────────
  {
    key: 'podcast_transcript.identify_speakers',
    type: 'workflow_step',
    label: 'Identify speakers',
    description: 'Maps Deepgram "Speaker N" diarisation labels to real names from the episode description + transcript',
    workflow: 'podcast_transcript',
    fallbackAgent: 'roger',
  },

  // ── Podcast episode intelligence (summary) ─────────────────────────────────
  {
    key: 'podcast_intel.narrate',
    type: 'workflow_step',
    label: 'Episode summary',
    description: 'Roger writes a short, descriptive brief of an episode from its transcript',
    workflow: 'podcast_intel',
    fallbackAgent: 'roger',
  },
  {
    key: 'podcast_intel.compliance_check',
    type: 'workflow_step',
    label: 'Compliance check',
    description: 'Lex reviews an episode summary for advice risk before it can be published',
    workflow: 'podcast_intel',
    fallbackAgent: 'lex',
  },
  {
    key: 'podcast_intel.relevance',
    type: 'workflow_step',
    label: 'Episode relevance',
    description: 'Rex scores an episode on material/novelty/citation and classifies its category, from the brief (podcast-tuned fork of the news rubric)',
    workflow: 'podcast_intel',
    fallbackAgent: 'rex',
  },

  // ── Ask the library (RAG answer over transcripts) ──────────────────────────
  {
    key: 'library_answer.synthesize',
    type: 'workflow_step',
    label: 'Library answer',
    description: 'Rex synthesises a cited answer to a director question from retrieved transcript segments',
    workflow: 'library_answer',
    fallbackAgent: 'rex',
  },
  {
    key: 'library_answer.compliance_check',
    type: 'workflow_step',
    label: 'Answer compliance check',
    description: 'Lex reviews a synthesised library answer for advice risk',
    workflow: 'library_answer',
    fallbackAgent: 'lex',
  },
] as const;

export const WORKFLOW_LABELS: Record<string, string> = {
  recorder: 'Recorder',
  pm: 'PM',
  executeRoutine: 'Routines',
  newsletter: 'Newsletter',
  variant: 'Variant Generation',
  strategy: 'Campaign Strategy',
  social_post: 'Social Posts from News',
  podcast_transcript: 'Podcast Transcript',
  podcast_intel: 'Podcast Intelligence',
  library_answer: 'Ask the Library',
  market_report: 'Market Report',
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
