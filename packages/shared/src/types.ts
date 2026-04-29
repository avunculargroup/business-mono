// ============================================================
// Pipeline & Status Enums
// ============================================================

export const PipelineStage = {
  LEAD: 'lead',
  WARM: 'warm',
  ACTIVE: 'active',
  CLIENT: 'client',
  DORMANT: 'dormant',
} as const;
export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

export const BitcoinLiteracy = {
  UNKNOWN: 'unknown',
  NONE: 'none',
  BASIC: 'basic',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
} as const;
export type BitcoinLiteracy = (typeof BitcoinLiteracy)[keyof typeof BitcoinLiteracy];

export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const ProjectStatus = {
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ContentStatus = {
  IDEA: 'idea',
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const ContentType = {
  LINKEDIN: 'linkedin',
  TWITTER_X: 'twitter_x',
  NEWSLETTER: 'newsletter',
  BLOG: 'blog',
  EMAIL: 'email',
  IDEA: 'idea',
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const InteractionType = {
  CALL: 'call',
  EMAIL: 'email',
  MEETING: 'meeting',
  ZOOM: 'zoom',
  SIGNAL: 'signal',
  LINKEDIN: 'linkedin',
  NOTE: 'note',
  OTHER: 'other',
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];

export const InteractionSource = {
  MANUAL: 'manual',
  COORDINATOR_AGENT: 'coordinator_agent',
  RECORDER_AGENT: 'recorder_agent',
  SIGNAL: 'signal',
  CALL_TRANSCRIPT: 'call_transcript',
  FASTMAIL_SYNC: 'fastmail_sync',
} as const;
export type InteractionSource = (typeof InteractionSource)[keyof typeof InteractionSource];

export const AgentName = {
  SIMON: 'simon',
  ROGER: 'roger',
  ARCHIE: 'archie',
  PETRA: 'petra',
  BRUNO: 'bruno',
  CHARLIE: 'charlie',
  REX: 'rex',
  DELLA: 'della',
} as const;
export type AgentName = (typeof AgentName)[keyof typeof AgentName];

export const AgentActivityStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  AUTO: 'auto',
  IN_PROGRESS: 'in_progress',
  ERROR: 'error',
} as const;
export type AgentActivityStatus = (typeof AgentActivityStatus)[keyof typeof AgentActivityStatus];

export const KnowledgeStance = {
  ALIGNED: 'aligned',
  NEUTRAL: 'neutral',
  OPPOSED: 'opposed',
  MIXED: 'mixed',
} as const;
export type KnowledgeStance = (typeof KnowledgeStance)[keyof typeof KnowledgeStance];

export const KnowledgeRelationship = {
  SUPPORTS: 'supports',
  CONTRADICTS: 'contradicts',
  EXTENDS: 'extends',
  UPDATES: 'updates',
  CITES: 'cites',
  RELATED_TO: 'related_to',
} as const;
export type KnowledgeRelationship = (typeof KnowledgeRelationship)[keyof typeof KnowledgeRelationship];

export const RequirementStatus = {
  DRAFT: 'draft',
  IN_CLARIFICATION: 'in_clarification',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  SUPERSEDED: 'superseded',
} as const;
export type RequirementStatus = (typeof RequirementStatus)[keyof typeof RequirementStatus];

export const RiskSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

export const RiskLikelihood = {
  UNLIKELY: 'unlikely',
  POSSIBLE: 'possible',
  LIKELY: 'likely',
  CERTAIN: 'certain',
} as const;
export type RiskLikelihood = (typeof RiskLikelihood)[keyof typeof RiskLikelihood];

export const RiskStatus = {
  IDENTIFIED: 'identified',
  MITIGATING: 'mitigating',
  ACCEPTED: 'accepted',
  RESOLVED: 'resolved',
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];

export const ReminderStatus = {
  PENDING: 'pending',
  FIRED: 'fired',
  DISMISSED: 'dismissed',
} as const;
export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];

export const CapabilityStatus = {
  ACTIVE: 'active',
  PLANNED: 'planned',
  UNAVAILABLE: 'unavailable',
} as const;
export type CapabilityStatus = (typeof CapabilityStatus)[keyof typeof CapabilityStatus];

export const CapacityGapType = {
  NO_AGENT: 'no_agent',
  MISSING_TOOL: 'missing_tool',
  WORKLOAD: 'workload',
  BROKEN_CHAIN: 'broken_chain',
} as const;
export type CapacityGapType = (typeof CapacityGapType)[keyof typeof CapacityGapType];

// ============================================================
// JSONB Shapes — interactions.extracted_data
// ============================================================

export interface ExtractedDecision {
  text: string;
  context: string;
  timestamp?: string;
}

export interface ExtractedActionItem {
  text: string;
  assignee?: string;
  deadline?: string;
  context: string;
}

export interface ExtractedBitcoinSignal {
  contact: string;
  current_level?: BitcoinLiteracy;
  inferred_level?: BitcoinLiteracy;
  evidence: string;
}

export interface ExtractedCommitment {
  who: string;
  what: string;
  by_when?: string;
  context: string;
}

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'company' | 'org';
  confidence: number;
}

export interface InteractionExtractedData {
  decisions: ExtractedDecision[];
  action_items: ExtractedActionItem[];
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  bitcoin_signals: ExtractedBitcoinSignal[];
  commitments: ExtractedCommitment[];
  mentioned_entities: ExtractedEntity[];
}

// ============================================================
// JSONB Shapes — requirements
// ============================================================

export interface UserStory {
  as_a: string;
  i_want: string;
  so_that: string;
}

export interface RequirementDependency {
  type: string;
  description: string;
  reference_id?: string;
}

export interface ClarificationRound {
  questions: string[];
  answers: string[];
  round_number: number;
  timestamp: string;
}

// ============================================================
// JSONB Shapes — agent_activity
// ============================================================

export interface ClarificationExchange {
  question: string;
  answer: string;
  resolved_at: string;
}

// ============================================================
// Signal message shape
// ============================================================

export interface SignalMessage {
  sender: string;
  body: string;
  timestamp: string;
  attachments?: Array<{ contentType: string; filename: string; size: number }>;
}

// ============================================================
// Research Agent — Contracts
// ============================================================

export const ResearchPurpose = {
  VERIFY: 'verify',
  SUMMARISE: 'summarise',
  DEEP_RESEARCH: 'deep_research',
  INGEST_URL: 'ingest_url',
  MONITOR: 'monitor',
} as const;
export type ResearchPurpose = (typeof ResearchPurpose)[keyof typeof ResearchPurpose];

export const ResearchRequester = {
  SIMON: 'simon',
  ARCHIVIST: 'archie',
  CHARLIE: 'charlie',
  HUMAN: 'human',
} as const;
export type ResearchRequester = (typeof ResearchRequester)[keyof typeof ResearchRequester];

export const ResearchUrgency = {
  SYNC: 'sync',
  ASYNC: 'async',
} as const;
export type ResearchUrgency = (typeof ResearchUrgency)[keyof typeof ResearchUrgency];

export const VerificationVerdict = {
  CONFIRMED: 'confirmed',
  REFUTED: 'refuted',
  UNVERIFIABLE: 'unverifiable',
  PARTIAL: 'partial',
} as const;
export type VerificationVerdict = (typeof VerificationVerdict)[keyof typeof VerificationVerdict];

export const ResearchConfidence = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;
export type ResearchConfidence = (typeof ResearchConfidence)[keyof typeof ResearchConfidence];

export const MonitorFrequency = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  FORTNIGHTLY: 'fortnightly',
} as const;
export type MonitorFrequency = (typeof MonitorFrequency)[keyof typeof MonitorFrequency];

export interface ResearchSource {
  url: string;
  title: string;
  excerpt: string;
  retrieved_at: string;
}

export interface ResearchBrief {
  purpose: ResearchPurpose;
  requester: ResearchRequester;
  subject: string;
  context?: string;
  url?: string;
  monitor_id?: string;
  urgency: ResearchUrgency;
  outputSchema?: Record<string, unknown>;
}

export interface ResearchVerification {
  verdict: VerificationVerdict;
  confidence: ResearchConfidence;
  summary: string;
  sources: ResearchSource[];
}

export interface ResearchSummary {
  headline: string;
  body: string;
  key_points: string[];
  sources: ResearchSource[];
  relevance_note?: string;
}

export interface ResearchMonitorResult {
  has_changed: boolean;
  change_summary?: string;
  prior_digest: string;
  current_digest: string;
  sources: ResearchSource[];
}

export interface ResearchIngestion {
  url: string;
  title: string;
  clean_markdown: string;
  extracted_at: string;
  /** Where the transcript/content was sourced from. */
  transcript_source?: 'page' | 'youtube' | 'none';
  /** YouTube video URL when transcript was sourced from YouTube. */
  youtube_url?: string;
  /** True when the content is a podcast episode and no transcript could be found online. */
  needs_audio_upload?: boolean;
}

export interface ResearchMetadata {
  completed_at: string;
  tool_calls_made: number;
  search_provider: 'tavily';
  duration_ms: number;
}

export interface ResearchResult {
  brief: ResearchBrief;
  purpose: ResearchPurpose;
  verification?: ResearchVerification;
  summary?: ResearchSummary;
  monitor?: ResearchMonitorResult;
  ingestion?: ResearchIngestion;
  metadata: ResearchMetadata;
}


// ============================================================
// Discovery Interviews
// ============================================================

export const StakeholderRole = {
  CFO:        'CFO',
  CEO:        'CEO',
  HR:         'HR',
  TREASURY:   'Treasury',
  PEOPLE_OPS: 'PeopleOps',
  OTHER:      'Other',
} as const;
export type StakeholderRole = (typeof StakeholderRole)[keyof typeof StakeholderRole];

export const TriggerEventType = {
  FASB_CHANGE:          'FASB_CHANGE',
  EMPLOYEE_BTC_REQUEST: 'EMPLOYEE_BTC_REQUEST',
  REGULATORY_UPDATE:    'REGULATORY_UPDATE',
  OTHER:                'OTHER',
} as const;
export type TriggerEventType = (typeof TriggerEventType)[keyof typeof TriggerEventType];

export const InterviewStatus = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW:   'no_show',
} as const;
export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

export const DiscoveryInterviewChannel = {
  CALL:      'call',
  EMAIL:     'email',
  IN_PERSON: 'in_person',
  OTHER:     'other',
} as const;
export type DiscoveryInterviewChannel = (typeof DiscoveryInterviewChannel)[keyof typeof DiscoveryInterviewChannel];

export const STAKEHOLDER_ROLE_LABELS: Record<StakeholderRole, string> = {
  CFO:       'CFO',
  CEO:       'CEO',
  HR:        'HR',
  Treasury:  'Treasury',
  PeopleOps: 'People Ops',
  Other:     'Other',
};

export const TRIGGER_EVENT_LABELS: Record<TriggerEventType, string> = {
  FASB_CHANGE:          'FASB change',
  EMPLOYEE_BTC_REQUEST: 'Employee BTC request',
  REGULATORY_UPDATE:    'Regulatory update',
  OTHER:                'Other',
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show:   'No show',
};

export const INTERVIEW_CHANNEL_LABELS: Record<DiscoveryInterviewChannel, string> = {
  call:      'Call',
  email:     'Email',
  in_person: 'In person',
  other:     'Other',
};

export interface DiscoveryInterview {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  interview_date: string | null;
  status: InterviewStatus;
  channel: string | null;
  notes: string | null;
  pain_points: string[];
  trigger_event: TriggerEventType | null;
  email_thread_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PainPointLog {
  id: number;
  interview_id: string;
  pain_point: string;
  change_type: string;
  changed_at: string;
}

export interface SegmentScorecard {
  id: string;
  segment_name: string;
  need_score: number | null;
  access_score: number | null;
  planned_interviews: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PainPoint {
  id: string;
  interview_id: string;
  content: string;
  created_at: string;
}

// ============================================================
// Phase 2 — Corporate Lexicon
// ============================================================

export const LexiconStatus = {
  DRAFT:      'draft',
  APPROVED:   'approved',
  DEPRECATED: 'deprecated',
} as const;
export type LexiconStatus = (typeof LexiconStatus)[keyof typeof LexiconStatus];

export const LEXICON_STATUS_LABELS: Record<LexiconStatus, string> = {
  draft:      'Draft',
  approved:   'Approved',
  deprecated: 'Deprecated',
};

export interface CorporateLexiconEntry {
  id: string;
  term: string;
  professional_term: string;
  definition: string | null;
  category: string | null;
  example_usage: string | null;
  status: LexiconStatus;
  version: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 2 — MVP Templates
// ============================================================

export const TemplateType = {
  ONE_PAGER:     'one_pager',
  BRIEFING_DECK: 'briefing_deck',
} as const;
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

export const TemplateVersionStatus = {
  DRAFT:      'draft',
  APPROVED:   'approved',
  DEPRECATED: 'deprecated',
} as const;
export type TemplateVersionStatus = (typeof TemplateVersionStatus)[keyof typeof TemplateVersionStatus];

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  one_pager:     'One-pager',
  briefing_deck: 'Briefing deck',
};

export const TEMPLATE_VERSION_STATUS_LABELS: Record<TemplateVersionStatus, string> = {
  draft:      'Draft',
  approved:   'Approved',
  deprecated: 'Deprecated',
};

export interface MvpTemplate {
  id: string;
  type: TemplateType;
  title: string;
  description: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MvpTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  status: TemplateVersionStatus;
  content: Record<string, unknown>;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

// ============================================================
// Documents
// ============================================================

export const DocumentType = {
  REPORT:   'report',
  PROPOSAL: 'proposal',
  BRIEF:    'brief',
  MEMO:     'memo',
  STRATEGY: 'strategy',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentVersionStatus = {
  DRAFT:      'draft',
  APPROVED:   'approved',
  DEPRECATED: 'deprecated',
} as const;
export type DocumentVersionStatus = (typeof DocumentVersionStatus)[keyof typeof DocumentVersionStatus];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  report:   'Report',
  proposal: 'Proposal',
  brief:    'Brief',
  memo:     'Memo',
  strategy: 'Strategy',
};

export const DOCUMENT_VERSION_STATUS_LABELS: Record<DocumentVersionStatus, string> = {
  draft:      'Draft',
  approved:   'Approved',
  deprecated: 'Deprecated',
};

export interface BtsDocument {
  id: string;
  type: DocumentType;
  title: string;
  description: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  status: DocumentVersionStatus;
  content: Record<string, unknown>;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

// ============================================================
// Phase 2 — Feedback Repository
// ============================================================

export const FeedbackSource = {
  INTERVIEW:   'interview',
  SURVEY:      'survey',
  EMAIL:       'email',
  TESTIMONIAL: 'testimonial',
} as const;
export type FeedbackSource = (typeof FeedbackSource)[keyof typeof FeedbackSource];

export const FeedbackCategory = {
  BUG_REPORT:      'bug_report',
  FEATURE_REQUEST: 'feature_request',
  USABILITY:       'usability',
  TESTIMONIAL:     'testimonial',
} as const;
export type FeedbackCategory = (typeof FeedbackCategory)[keyof typeof FeedbackCategory];

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  interview:   'Interview',
  survey:      'Survey',
  email:       'Email',
  testimonial: 'Testimonial',
};

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug_report:      'Bug report',
  feature_request: 'Feature request',
  usability:       'Usability',
  testimonial:     'Testimonial',
};

export interface FeedbackSentiment {
  score: number;
  magnitude: number;
  label: 'positive' | 'neutral' | 'negative' | 'mixed';
}

export interface FeedbackEntry {
  id: string;
  contact_id: string | null;
  company_id: string | null;
  pain_point_id: string | null;
  source: FeedbackSource;
  date_received: string | null;
  category: FeedbackCategory;
  rating: number | null;
  description: string;
  tags: string[];
  sentiment: FeedbackSentiment | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 2 — Insight Pipeline (augments ContentStatus/ContentType)
// ============================================================
// The pipeline reuses content_items filtered to type='linkedin'.
// These stage labels map content_items status values to Kanban column names.

export const INSIGHT_PIPELINE_STAGE_LABELS: Record<string, string> = {
  idea:      'Ideas',
  draft:     'Committed',
  review:    'In Progress',
  approved:  'Ready to Publish',
  published: 'Posted',
  archived:  'Archived',
};

export interface ResearchLink {
  url: string;
  title: string;
  note?: string;
}

// ============================================================
// Phase 3 — Community Watchlist
// ============================================================

export const CommunityType = {
  LINKEDIN_GROUP: 'linkedin_group',
  ASSOCIATION:    'association',
  CONFERENCE:     'conference',
} as const;
export type CommunityType = (typeof CommunityType)[keyof typeof CommunityType];

export const EngagementStatus = {
  NOT_JOINED: 'not_joined',
  JOINED:     'joined',
  ATTENDED:   'attended',
  SPONSOR:    'sponsor',
} as const;
export type EngagementStatus = (typeof EngagementStatus)[keyof typeof EngagementStatus];

export const COMMUNITY_TYPE_LABELS: Record<CommunityType, string> = {
  linkedin_group: 'LinkedIn Group',
  association:    'Association',
  conference:     'Conference',
};

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  not_joined: 'Not joined',
  joined:     'Joined',
  attended:   'Attended',
  sponsor:    'Sponsor',
};

export interface CommunityWatchlistEntry {
  id: string;
  type: CommunityType;
  name: string;
  url: string | null;
  description: string | null;
  role_tags: string[];
  industry_tags: string[];
  membership_size: number | null;
  activity_level: number | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  engagement_status: EngagementStatus;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 3 — Champion Tracking
// ============================================================

export const ChampionRoleType = {
  CHAMPION:       'Champion',
  ECONOMIC_BUYER: 'Economic Buyer',
  INFLUENCER:     'Influencer',
} as const;
export type ChampionRoleType = (typeof ChampionRoleType)[keyof typeof ChampionRoleType];

export const ChampionStatus = {
  ACTIVE:   'active',
  AT_RISK:  'at_risk',
  DEPARTED: 'departed',
} as const;
export type ChampionStatus = (typeof ChampionStatus)[keyof typeof ChampionStatus];

export const ChampionEventType = {
  JOB_CHANGE: 'job_change',
  PROMOTION:  'promotion',
  DEPARTURE:  'departure',
  NOTE:       'note',
} as const;
export type ChampionEventType = (typeof ChampionEventType)[keyof typeof ChampionEventType];

export const CHAMPION_ROLE_TYPE_LABELS: Record<ChampionRoleType, string> = {
  Champion:        'Champion',
  'Economic Buyer': 'Economic Buyer',
  Influencer:      'Influencer',
};

export const CHAMPION_STATUS_LABELS: Record<ChampionStatus, string> = {
  active:   'Active',
  at_risk:  'At risk',
  departed: 'Departed',
};

export const CHAMPION_EVENT_TYPE_LABELS: Record<ChampionEventType, string> = {
  job_change: 'Job change',
  promotion:  'Promotion',
  departure:  'Departure',
  note:       'Note',
};

export interface Champion {
  id: string;
  contact_id: string;
  company_id: string | null;
  role_type: ChampionRoleType;
  champion_score: number;
  status: ChampionStatus;
  last_contacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChampionEvent {
  id: string;
  champion_id: string;
  event_type: ChampionEventType;
  event_date: string;
  details: string | null;
  created_at: string;
}

// ============================================================
// Slide Builder
// ============================================================

export const SlideType = {
  TITLE: 'title',
  SECTION: 'section',
  AGENDA: 'agenda',
  TWO_COLUMN: 'two_column',
  IMAGE_CAPTION: 'image_caption',
  KPI_GRID: 'kpi_grid',
  QUOTE: 'quote',
  CLOSING: 'closing',
} as const;
export type SlideType = (typeof SlideType)[keyof typeof SlideType];

export const SLIDE_TYPE_LABELS: Record<SlideType, string> = {
  title: 'Title Slide',
  section: 'Section Header',
  agenda: 'Agenda',
  two_column: 'Two Column',
  image_caption: 'Image + Caption',
  kpi_grid: 'KPI Grid',
  quote: 'Quote',
  closing: 'Closing Slide',
};

export const DeckStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type DeckStatus = (typeof DeckStatus)[keyof typeof DeckStatus];

export const DECK_STATUS_LABELS: Record<DeckStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

// ============================================================
// Company Records
// ============================================================

export type CompanyContentType = 'text' | 'markdown' | 'image' | 'file';

export const COMPANY_CONTENT_TYPE_LABELS: Record<CompanyContentType, string> = {
  text:     'Text',
  markdown: 'Rich Text',
  image:    'Image',
  file:     'File',
};

export interface CompanyRecordType {
  key: string;
  label: string;
  content_type: CompanyContentType;
  category: string;
  is_singleton: boolean;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
}

export interface CompanyRecord {
  id: string;
  type_key: string;
  value: string | null;
  storage_path: string | null;
  filename: string | null;
  mime_type: string | null;
  is_pinned: boolean;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  type?: CompanyRecordType;
}

// ============================================================
// Company Domains
// ============================================================

export interface CompanyDomain {
  id: string;
  name: string;
  provider: string | null;
  renewal_date: string | null; // ISO date yyyy-mm-dd
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Company Subscriptions
// ============================================================

export type SubscriptionPaymentType = 'free' | 'paid' | 'trial';

export interface CompanySubscription {
  id: string;
  business: string;
  website: string | null;
  service_type: string | null;
  payment_type: SubscriptionPaymentType | null;
  expiry: string | null; // ISO date yyyy-mm-dd
  account_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Personas
// ============================================================

export const PersonaMarketSegment = {
  SME:             'sme',
  PUBLIC_COMPANY:  'public_company',
  FAMILY_OFFICE:   'family_office',
  HNW:             'hnw',
  STARTUP:         'startup',
  SUPERANNUATION:  'superannuation',
} as const;
export type PersonaMarketSegment = (typeof PersonaMarketSegment)[keyof typeof PersonaMarketSegment];

export const PersonaSophisticationLevel = {
  NOVICE:       'novice',
  INTERMEDIATE: 'intermediate',
  EXPERT:       'expert',
} as const;
export type PersonaSophisticationLevel = (typeof PersonaSophisticationLevel)[keyof typeof PersonaSophisticationLevel];

export const PersonaDecisionStyle = {
  DATA_DRIVEN:       'data_driven',
  CONSENSUS_SEEKING: 'consensus_seeking',
  RISK_AVERSE:       'risk_averse',
  OPPORTUNISTIC:     'opportunistic',
  PROCESS_ORIENTED:  'process_oriented',
} as const;
export type PersonaDecisionStyle = (typeof PersonaDecisionStyle)[keyof typeof PersonaDecisionStyle];

export const PERSONA_MARKET_SEGMENT_LABELS: Record<PersonaMarketSegment, string> = {
  sme:            'SME',
  public_company: 'Public Company',
  family_office:  'Family Office',
  hnw:            'HNW Individual',
  startup:        'Startup',
  superannuation: 'Superannuation',
};

export const PERSONA_SOPHISTICATION_LABELS: Record<PersonaSophisticationLevel, string> = {
  novice:       'Novice',
  intermediate: 'Intermediate',
  expert:       'Expert',
};

export const PERSONA_DECISION_STYLE_LABELS: Record<PersonaDecisionStyle, string> = {
  data_driven:       'Data-driven',
  consensus_seeking: 'Consensus-seeking',
  risk_averse:       'Risk-averse',
  opportunistic:     'Opportunistic',
  process_oriented:  'Process-oriented',
};

export interface PsychographicProfile {
  north_star?: string;
  anti_goal?: string;
  decision_making_style?: PersonaDecisionStyle;
  time_horizon?: 'short_term' | 'medium_term' | 'long_term';
  risk_tolerance?: 'low' | 'medium' | 'high';
  custom_traits?: string[];
}

export interface StrategicConstraints {
  regulatory_hurdles?: string[];
  gatekeepers?: string[];
  preferred_mediums?: string[];
  approval_layers?: 'single' | 'multi_stage' | 'committee';
  budget_approval_cycle?: 'monthly' | 'quarterly' | 'annual';
}

export interface PersonaSuccessSignals {
  resonant_phrases?: string[];
  success_indicators?: string[];
  pain_point_keywords?: string[];
}

export interface Persona {
  id: string;
  name: string;
  market_segment: PersonaMarketSegment;
  sophistication_level: PersonaSophisticationLevel;
  estimated_aum: string | null;
  psychographic_profile: PsychographicProfile | null;
  strategic_constraints: StrategicConstraints | null;
  success_signals: PersonaSuccessSignals | null;
  objection_bank: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
