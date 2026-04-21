// Model used across all agents
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';

// Embedding model (OpenAI)
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

// Deepgram
export const DEEPGRAM_MODEL = 'nova-3';

// Agent workload threshold — flag overload above this
export const WORKLOAD_OVERLOAD_THRESHOLD = 8;

// BA clarification rounds max
export const MAX_CLARIFICATION_ROUNDS = 3;

// Content Creator max iteration rounds
export const MAX_CONTENT_ITERATIONS = 5;

// Knowledge item staleness threshold (months)
export const KNOWLEDGE_STALENESS_MONTHS = 6;

// PM risk detection: task blocked threshold (days)
export const BLOCKED_TASK_THRESHOLD_DAYS = 3;

// Researcher: Tavily free tier monthly limit
export const TAVILY_MONTHLY_LIMIT = 1000;

// Researcher: Firecrawl free tier monthly limit
export const FIRECRAWL_MONTHLY_LIMIT = 500;

// Routine scheduler: how often the listener polls for due routines — 1 hour
export const ROUTINE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
