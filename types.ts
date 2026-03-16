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
} as const;
export type InteractionSource = (typeof InteractionSource)[keyof typeof InteractionSource];

export const AgentName = {
  SIMON: 'simon',
  RECORDER: 'recorder',
  ARCHIVIST: 'archivist',
  PM: 'pm',
  BA: 'ba',
  CONTENT_CREATOR: 'content_creator',
} as const;
export type AgentName = (typeof AgentName)[keyof typeof AgentName];

export const AgentActivityStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  AUTO: 'auto',
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

export const ReminderStatus = {
  PENDING: 'pending',
  FIRED: 'fired',
  DISMISSED: 'dismissed',
} as const;
export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];

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
// Capacity Awareness
// ============================================================

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
