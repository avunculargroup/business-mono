-- ============================================================
-- INTERNAL BUSINESS PLATFORM — SUPABASE SCHEMA v2
-- Bitcoin Treasury Training & Consulting
-- ============================================================
-- READ-ONLY REFERENCE — do not execute directly against a live database.
-- Execution source of truth: supabase/migrations/
-- Migrations are applied automatically on push to main via .github/workflows/migrate.yml
-- Keep this file up to date as a consolidated human-readable snapshot.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector for embeddings
-- CREATE EXTENSION IF NOT EXISTS pgrouting; -- deferred: enable when path queries needed


-- ============================================================
-- UTILITIES
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- DISCOVERY ENUMS
-- ============================================================

CREATE TYPE stakeholder_role AS ENUM ('CFO','CEO','HR','Treasury','PeopleOps','Other');
CREATE TYPE trigger_event_type AS ENUM ('FASB_CHANGE','EMPLOYEE_BTC_REQUEST','REGULATORY_UPDATE','OTHER');


-- ============================================================
-- TEAM MEMBERS
-- ============================================================

CREATE TABLE team_members (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'founder',
  signal_number TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- CRM
-- ============================================================

CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name          TEXT NOT NULL,
  industry      TEXT,
  size          TEXT,
  country       TEXT,
  website       TEXT,
  linkedin_url  TEXT,
  notes         TEXT,
  source        TEXT DEFAULT 'manual'
                  CHECK (source IN ('manual', 'web', 'coordinator_agent', 'recorder_agent', 'call_transcript')),
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  job_title       TEXT,
  email           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,

  pipeline_stage  TEXT NOT NULL DEFAULT 'lead'
                  CHECK (pipeline_stage IN ('lead', 'warm', 'active', 'client', 'dormant')),

  bitcoin_literacy TEXT DEFAULT 'unknown'
                  CHECK (bitcoin_literacy IN ('unknown', 'none', 'basic', 'intermediate', 'advanced')),

  owner_id        UUID REFERENCES team_members(id),
  notes           TEXT,
  tags            TEXT[],
  source          TEXT DEFAULT 'manual'
                  CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript', 'fastmail_sync')),
  role            stakeholder_role,
  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_pipeline ON contacts(pipeline_stage);
CREATE INDEX idx_contacts_owner ON contacts(owner_id);


CREATE TABLE interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,

  type            TEXT NOT NULL
                  CHECK (type IN ('call', 'email', 'meeting', 'zoom', 'signal', 'linkedin', 'note', 'other')),

  direction       TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER,
  participants    TEXT[],

  raw_content     TEXT,
  summary         TEXT,

  extracted_data  JSONB DEFAULT '{}',
  -- Shape: see @platform/shared InteractionExtractedData

  source          TEXT DEFAULT 'manual'
                  CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript', 'fastmail_sync')),

  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_interactions_contact ON interactions(contact_id);
CREATE INDEX idx_interactions_occurred ON interactions(occurred_at DESC);
CREATE INDEX idx_interactions_type ON interactions(type);


-- ============================================================
-- TASKS & PROJECTS
-- ============================================================

CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name              TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  priority          TEXT DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  target_date       DATE,
  related_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id        UUID REFERENCES tasks(id) ON DELETE SET NULL,

  title                 TEXT NOT NULL,
  description           TEXT,

  status                TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),

  priority              TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  assigned_to           UUID REFERENCES team_members(id),
  due_date              DATE,
  reminder_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,

  source                TEXT DEFAULT 'manual'
                        CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'pm_agent', 'ba_agent', 'content_agent', 'signal')),
  source_interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,
  source_activity_id    UUID REFERENCES agent_activity(id) ON DELETE SET NULL,

  related_contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,

  tags                  TEXT[],
  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);


-- ============================================================
-- CONTENT PIPELINE
-- ============================================================

CREATE TABLE content_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  title           TEXT,
  body            TEXT,

  type            TEXT NOT NULL
                  CHECK (type IN ('linkedin', 'twitter_x', 'newsletter', 'blog', 'email', 'idea')),

  status          TEXT NOT NULL DEFAULT 'idea'
                  CHECK (status IN ('idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived')),

  topic_tags      TEXT[],

  scheduled_for   TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  published_url   TEXT,

  source          TEXT DEFAULT 'manual'
                  CHECK (source IN ('manual', 'coordinator_agent', 'content_agent', 'archivist_agent')),
  source_interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,

  assigned_to     UUID REFERENCES team_members(id),
  created_by      UUID REFERENCES team_members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_content_status ON content_items(status);
CREATE INDEX idx_content_type ON content_items(type);


-- ============================================================
-- BRAND HUB
-- ============================================================

CREATE TABLE brand_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL
                CHECK (type IN ('logo', 'colour_palette', 'typography', 'tone_of_voice',
                                'style_guide', 'template', 'image', 'other')),
  description   TEXT,
  file_url      TEXT,
  content       TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER brand_assets_updated_at
  BEFORE UPDATE ON brand_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- SOCIAL ACCOUNTS & VOICE
-- ============================================================
-- Voice source-of-truth tables (migration 20260605120000). Company voice canon
-- moves out of docs/brand-voice.md into brand_voice (singleton, app-layer
-- enforced); each social_accounts.voice_profile is the per-account application
-- of that canon (umbrella + override). voice_snippets is the embeddable
-- exemplar library. RLS allows authenticated + service_role (agents embed via
-- service_role). See docs/brand-voice-migration-spec.md.

-- Destinations a campaign posts from. A founder on X and on LinkedIn are
-- separate rows. team_member_id is NULL for company accounts.
CREATE TABLE social_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT        NOT NULL
                        CHECK (platform IN ('linkedin', 'twitter_x')),
  account_type        TEXT        NOT NULL
                        CHECK (account_type IN ('company', 'founder')),
  display_name        TEXT        NOT NULL,
  handle              TEXT,
  profile_url         TEXT,
  team_member_id      UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  voice_profile       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  api_credentials_ref TEXT,                              -- Phase 2: secret-store ref only
  created_by          UUID        REFERENCES team_members(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX idx_social_accounts_member   ON social_accounts(team_member_id);

-- Singleton company-voice canon (app-layer singleton, like company_profile).
-- profile shares the social_accounts.voice_profile shape. Seeded in Step 3.
CREATE TABLE brand_voice (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile                     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  mission_summary             TEXT,
  bitcoin_capitalisation_rule TEXT,
  content_policy              JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- topics_endorsed / topics_avoided / aligned_voices / contrarian_views
  version                     TEXT        NOT NULL DEFAULT '1.0',
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by                  UUID        REFERENCES team_members(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER brand_voice_updated_at
  BEFORE UPDATE ON brand_voice
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Embeddable exemplar library. social_account_id NULL = company canon. Embedded
-- on save via text-embedding-3-small (HNSW index, pgvector 0.8.0).
CREATE TABLE voice_snippets (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id      UUID        REFERENCES social_accounts(id) ON DELETE CASCADE,  -- NULL = company canon
  snippet_type           TEXT        NOT NULL
                           CHECK (snippet_type IN (
                             'phrase', 'opener', 'closer', 'transition',
                             'paragraph', 'full_post', 'cta')),
  body                   TEXT        NOT NULL,
  curator_note           TEXT,
  platform               TEXT        CHECK (platform IN ('linkedin', 'twitter_x')),  -- NULL = platform-agnostic
  topic_tags             TEXT[]      NOT NULL DEFAULT '{}',
  embedding              VECTOR(1536),
  is_starred             BOOLEAN     NOT NULL DEFAULT FALSE,
  source                 TEXT        NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual', 'promoted_from_post', 'agent')),
  source_content_item_id UUID        REFERENCES content_items(id) ON DELETE SET NULL,
  created_by             UUID        REFERENCES team_members(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER voice_snippets_updated_at
  BEFORE UPDATE ON voice_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_voice_snippets_account   ON voice_snippets(social_account_id);
CREATE INDEX idx_voice_snippets_type      ON voice_snippets(snippet_type);
CREATE INDEX idx_voice_snippets_tags      ON voice_snippets USING GIN (topic_tags);
CREATE INDEX idx_voice_snippets_starred   ON voice_snippets(is_starred) WHERE is_starred;
CREATE INDEX idx_voice_snippets_embedding ON voice_snippets USING hnsw (embedding vector_cosine_ops);

-- Semantic retrieval for packages/voice (migrations 20260605130000,
-- 20260630010000). Top-N snippets by cosine similarity to a query embedding,
-- scoped account+umbrella (or umbrella-only when p_account_id is NULL),
-- platform-matched, starred-weighted. Account snippets take precedence: when the
-- account has any matching snippet of its own, the company-canon snippets are
-- ignored and the canon serves only as a fallback. Default PUBLIC execute, like
-- the other vector_search_* functions.
CREATE OR REPLACE FUNCTION match_voice_snippets(
  query_embedding  VECTOR(1536),
  p_account_id     UUID    DEFAULT NULL,
  p_platform       TEXT    DEFAULT NULL,
  match_count      INT     DEFAULT 5,
  star_boost       FLOAT   DEFAULT 0.05,
  match_threshold  FLOAT   DEFAULT 0.0,
  p_snippet_types  TEXT[]  DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  social_account_id UUID,
  snippet_type      TEXT,
  body              TEXT,
  curator_note      TEXT,
  platform          TEXT,
  topic_tags        TEXT[],
  is_starred        BOOLEAN,
  similarity        FLOAT,
  score             FLOAT
)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT
      vs.id, vs.social_account_id, vs.snippet_type, vs.body, vs.curator_note,
      vs.platform, vs.topic_tags, vs.is_starred,
      1 - (vs.embedding <=> query_embedding) AS similarity,
      (1 - (vs.embedding <=> query_embedding))
        + (CASE WHEN vs.is_starred THEN star_boost ELSE 0 END) AS score
    FROM voice_snippets vs
    WHERE vs.embedding IS NOT NULL
      AND (
        (p_account_id IS NOT NULL
          AND (vs.social_account_id = p_account_id OR vs.social_account_id IS NULL))
        OR (p_account_id IS NULL AND vs.social_account_id IS NULL)
      )
      AND (p_platform IS NULL OR vs.platform = p_platform OR vs.platform IS NULL)
      AND (p_snippet_types IS NULL OR vs.snippet_type = ANY(p_snippet_types))
      AND 1 - (vs.embedding <=> query_embedding) >= match_threshold
  )
  SELECT
    c.id, c.social_account_id, c.snippet_type, c.body, c.curator_note,
    c.platform, c.topic_tags, c.is_starred, c.similarity, c.score
  FROM candidates c
  WHERE
    -- Account snippets win: if the account has any of its own, drop canon.
    NOT EXISTS (SELECT 1 FROM candidates a WHERE a.social_account_id = p_account_id)
    OR c.social_account_id = p_account_id
  ORDER BY score DESC
  LIMIT match_count;
$$;


-- ============================================================
-- KNOWLEDGE BASE (Archivist)
-- ============================================================

CREATE TABLE knowledge_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  source_url        TEXT,
  source_type       TEXT NOT NULL
                    CHECK (source_type IN ('article', 'youtube', 'report', 'podcast', 'tweet', 'internal', 'other')),
  source_author     TEXT,
  source_date       DATE,
  raw_content       TEXT,
  summary           TEXT,
  key_arguments     JSONB DEFAULT '[]',
  topic_tags        TEXT[],
  stance            TEXT CHECK (stance IN ('aligned', 'neutral', 'opposed', 'mixed')),
  stance_reasoning  TEXT,
  bitcoin_relevance TEXT CHECK (bitcoin_relevance IN ('direct', 'indirect', 'tangential')),
  embedding         VECTOR(1536),
  fts               TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(raw_content, ''))) STORED,
  archived_by       UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_knowledge_items_embedding ON knowledge_items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_items_fts ON knowledge_items USING gin(fts);
CREATE INDEX idx_knowledge_items_stance ON knowledge_items(stance);
CREATE INDEX idx_knowledge_items_source_type ON knowledge_items(source_type);
CREATE INDEX idx_knowledge_items_topic_tags ON knowledge_items USING gin(topic_tags);


-- Graph edges — adjacency list for recursive CTE traversal
-- Future-compatible with pgRouting (source/target/cost) and SQL/PGQ (VERTEX/EDGE)
CREATE TABLE knowledge_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id    UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  target_item_id    UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  relationship      TEXT NOT NULL
                    CHECK (relationship IN ('supports', 'contradicts', 'extends', 'updates', 'cites', 'related_to')),
  reasoning         TEXT,
  confidence        FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  created_by_agent  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kc_source ON knowledge_connections(source_item_id);
CREATE INDEX idx_kc_target ON knowledge_connections(target_item_id);
CREATE INDEX idx_kc_relationship ON knowledge_connections(relationship);


-- ============================================================
-- FORMS
-- ============================================================

CREATE TABLE forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  schema        JSONB NOT NULL DEFAULT '{}',
  is_published  BOOLEAN DEFAULT FALSE,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE form_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}',
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    TEXT,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX idx_form_submissions_submitted ON form_submissions(submitted_at DESC);


-- ============================================================
-- REQUIREMENTS (BA Agent)
-- ============================================================

CREATE TABLE requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id               UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  user_stories          JSONB DEFAULT '[]',
  acceptance_criteria   JSONB DEFAULT '[]',
  assumptions           TEXT[],
  constraints           TEXT[],
  out_of_scope          TEXT[],
  dependencies          JSONB DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'in_clarification', 'reviewed', 'approved', 'superseded')),
  clarification_rounds  JSONB DEFAULT '[]',
  created_by_agent      TEXT NOT NULL DEFAULT 'ba_agent',
  approved_by           UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER requirements_updated_at
  BEFORE UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_requirements_project ON requirements(project_id);
CREATE INDEX idx_requirements_status ON requirements(status);


-- ============================================================
-- RISK REGISTER (PM Agent)
-- ============================================================

CREATE TABLE risk_register (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  likelihood      TEXT NOT NULL CHECK (likelihood IN ('unlikely', 'possible', 'likely', 'certain')),
  status          TEXT NOT NULL DEFAULT 'identified'
                  CHECK (status IN ('identified', 'mitigating', 'accepted', 'resolved')),
  mitigation      TEXT,
  identified_by   TEXT NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER risk_register_updated_at
  BEFORE UPDATE ON risk_register
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_risk_project ON risk_register(project_id);
CREATE INDEX idx_risk_status ON risk_register(status);


-- ============================================================
-- REMINDERS (Simon, Recorder)
-- ============================================================

CREATE TABLE reminders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT,
  remind_at          TIMESTAMPTZ NOT NULL,
  assigned_to        UUID REFERENCES team_members(id),
  related_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  related_task_id    UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'fired', 'dismissed')),
  source             TEXT DEFAULT 'manual'
                     CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent')),
  created_by         UUID REFERENCES team_members(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_remind_at ON reminders(remind_at) WHERE status = 'pending';
CREATE INDEX idx_reminders_assigned ON reminders(assigned_to);


-- ============================================================
-- AGENT INFRASTRUCTURE
-- ============================================================

-- Conversation threads between Simon and directors
CREATE TABLE agent_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_chat_id  TEXT NOT NULL,
  thread_type     TEXT NOT NULL CHECK (thread_type IN ('group', 'direct')),
  participant_ids UUID[],
  messages        JSONB DEFAULT '[]',
  -- Shape: [{ role: 'user'|'assistant', content: string, timestamp: string, sender_name?: string }]
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER agent_conversations_updated_at
  BEFORE UPDATE ON agent_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_agent_conv_chat ON agent_conversations(signal_chat_id);

ALTER TABLE agent_conversations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_conversations;


-- Audit trail for all agent actions
CREATE TABLE agent_activity (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name        TEXT NOT NULL
                    CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della', 'margot', 'lex')),
  action            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'auto', 'error')),

  trigger_type      TEXT CHECK (trigger_type IN ('call_transcript', 'signal_message', 'manual', 'scheduled', 'agent')),
  trigger_ref       TEXT,

  workflow_run_id   TEXT,
  parent_activity_id UUID REFERENCES agent_activity(id) ON DELETE SET NULL,

  -- Entity the action touched (for conflict detection)
  entity_type       TEXT,
  entity_id         TEXT,

  proposed_actions  JSONB DEFAULT '[]',
  approved_actions  JSONB DEFAULT '[]',

  approved_by       UUID REFERENCES team_members(id),
  approved_at       TIMESTAMPTZ,

  clarifications    JSONB DEFAULT '[]',
  -- Shape: [{ question, answer, resolved_at }]

  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_activity_agent ON agent_activity(agent_name);
CREATE INDEX idx_agent_activity_status ON agent_activity(status);
CREATE INDEX idx_agent_activity_created ON agent_activity(created_at DESC);
CREATE INDEX idx_agent_activity_parent ON agent_activity(parent_activity_id);

CREATE TRIGGER agent_activity_updated_at
  BEFORE UPDATE ON agent_activity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE agent_activity REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity;


-- Registry of what the platform can do (Simon's capacity awareness)
CREATE TABLE platform_capabilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      TEXT NOT NULL
                  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della', 'margot', 'lex')),
  capability      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'planned', 'unavailable')),
  phase           TEXT,
  tools_required  TEXT[],
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER platform_capabilities_updated_at
  BEFORE UPDATE ON platform_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_capabilities_agent ON platform_capabilities(agent_name);
CREATE INDEX idx_capabilities_status ON platform_capabilities(status);


-- Log of directives Simon couldn't fully fulfil
CREATE TABLE capacity_gaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_summary   TEXT NOT NULL,
  gap_type            TEXT NOT NULL
                      CHECK (gap_type IN ('no_agent', 'missing_tool', 'workload', 'broken_chain')),
  details             TEXT,
  suggested_solution  TEXT,
  director_response   TEXT,
  resolved            BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capacity_gaps_resolved ON capacity_gaps(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_capacity_gaps_type ON capacity_gaps(gap_type);


-- ============================================================
-- ROUTINES (generic scheduled agent jobs)
-- ============================================================

CREATE TABLE routines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  agent_name        TEXT NOT NULL
                    CHECK (agent_name IN
                      ('simon','roger','archie','petra','bruno','charlie','rex','della','margot','lex')),
  action_type       TEXT NOT NULL
                    CHECK (action_type IN ('research_digest','monitor_change',
                                           'news_ingest','news_source_scan','newsletter',
                                           'podcast_ingest','news_curation','indicator_poll',
                                           'onchain_poll')),
  action_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency         TEXT NOT NULL
                    CHECK (frequency IN ('daily','weekly','fortnightly')),
  time_of_day       TIME NOT NULL DEFAULT '07:00',
  timezone          TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  next_run_at       TIMESTAMPTZ NOT NULL,
  last_run_at       TIMESTAMPTZ,
  last_result       JSONB,
  last_status       TEXT CHECK (last_status IN ('success','failed','running')),
  last_error        TEXT,
  show_on_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  dashboard_title   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_routines_next_run  ON routines(next_run_at) WHERE is_active;
CREATE INDEX idx_routines_dashboard ON routines(show_on_dashboard) WHERE show_on_dashboard;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_register         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacity_gaps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_voice           ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_snippets        ENABLE ROW LEVEL SECURITY;

-- Authenticated team members can read and write everything
CREATE POLICY "team_members_all" ON team_members
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "companies_all" ON companies
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "contacts_all" ON contacts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "interactions_all" ON interactions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "projects_all" ON projects
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "tasks_all" ON tasks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "content_items_all" ON content_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "brand_assets_all" ON brand_assets
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "knowledge_items_all" ON knowledge_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "knowledge_connections_all" ON knowledge_connections
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "forms_all" ON forms
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "form_submissions_read" ON form_submissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "form_submissions_insert" ON form_submissions
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "requirements_all" ON requirements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "risk_register_all" ON risk_register
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "reminders_all" ON reminders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "agent_conversations_all" ON agent_conversations
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "agent_activity_all" ON agent_activity
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "platform_capabilities_all" ON platform_capabilities
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "capacity_gaps_all" ON capacity_gaps
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "routines_all" ON routines
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "social_accounts_all" ON social_accounts
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "brand_voice_all" ON brand_voice
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "voice_snippets_all" ON voice_snippets
  FOR ALL USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


-- ============================================================
-- VIEWS FOR AGENT CONTEXT QUERIES
-- ============================================================

CREATE VIEW v_open_tasks AS
  SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.due_date,
    t.reminder_at,
    t.source,
    t.parent_task_id,
    tm.full_name AS assigned_to_name,
    c.first_name || ' ' || c.last_name AS related_contact_name,
    p.name AS project_name
  FROM tasks t
  LEFT JOIN team_members tm ON tm.id = t.assigned_to
  LEFT JOIN contacts c ON c.id = t.related_contact_id
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.status NOT IN ('done', 'cancelled');


CREATE VIEW v_recent_interactions AS
  SELECT
    i.id,
    i.type,
    i.direction,
    i.occurred_at,
    i.duration_seconds,
    i.participants,
    i.summary,
    i.extracted_data,
    i.source,
    c.first_name || ' ' || c.last_name AS contact_name,
    c.pipeline_stage,
    co.name AS company_name
  FROM interactions i
  LEFT JOIN contacts c ON c.id = i.contact_id
  LEFT JOIN companies co ON co.id = i.company_id
  ORDER BY i.occurred_at DESC;


CREATE VIEW v_contacts_overview AS
  SELECT
    c.id,
    c.first_name || ' ' || c.last_name AS full_name,
    c.job_title,
    c.pipeline_stage,
    c.bitcoin_literacy,
    c.tags,
    co.name AS company_name,
    co.industry,
    tm.full_name AS owner_name,
    COUNT(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled')) AS open_tasks
  FROM contacts c
  LEFT JOIN companies co ON co.id = c.company_id
  LEFT JOIN team_members tm ON tm.id = c.owner_id
  LEFT JOIN tasks t ON t.related_contact_id = c.id
  GROUP BY c.id, co.name, co.industry, tm.full_name;


-- Unresolved capacity gaps for Simon's morning briefing
CREATE VIEW v_unresolved_capacity_gaps AS
  SELECT
    id,
    directive_summary,
    gap_type,
    details,
    suggested_solution,
    created_at
  FROM capacity_gaps
  WHERE resolved = FALSE
  ORDER BY created_at DESC;


-- Active platform capabilities for Simon's capacity check
CREATE VIEW v_active_capabilities AS
  SELECT
    agent_name,
    capability,
    status,
    phase,
    tools_required
  FROM platform_capabilities
  WHERE status = 'active'
  ORDER BY agent_name, capability;


-- ============================================================
-- SEED: RESEARCHER CAPABILITIES
-- ============================================================

INSERT INTO platform_capabilities (agent_name, capability, status, phase, tools_required, notes) VALUES
  ('rex', 'web_search',             'active', 'phase_1', ARRAY['search_web'],                   'Tavily Search API — 1,000 searches/month free tier'),
  ('rex', 'fact_verification',       'active', 'phase_1', ARRAY['search_web', 'fetch_url'],      'Cross-reference claims across multiple sources'),
  ('rex', 'url_ingestion',           'active', 'phase_1', ARRAY['fetch_url', 'crawl_structured'], 'Extract clean markdown from URLs for Archivist'),
  ('rex', 'content_summarisation',   'active', 'phase_1', ARRAY['search_web', 'fetch_url'],      'Structured summaries with key points and sources'),
  ('rex', 'topic_monitoring',        'active', 'phase_1', ARRAY['search_web'],                   'Scheduled monitoring via routines table (action_type=monitor_change)'),
  ('rex', 'scheduled_digests',       'active', 'phase_1', ARRAY['search_web', 'fetch_url'],      'Recurring research digests via routines table (action_type=research_digest)')
ON CONFLICT DO NOTHING;


-- ============================================================
-- FASTMAIL JMAP EMAIL AUTO-LOGGING
-- ============================================================

CREATE TABLE IF NOT EXISTS fastmail_accounts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username              TEXT        NOT NULL UNIQUE,
  token                 TEXT        NOT NULL,
  display_name          TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  watched_addresses     TEXT[]      NOT NULL DEFAULT '{}', -- empty = all; non-empty = filter by these aliases
  research_folder       TEXT,                              -- Fastmail folder of research newsletters; polled by researchMailListener (not CRM)
  last_error            TEXT,
  last_error_at         TIMESTAMPTZ,
  consecutive_failures  INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER fastmail_accounts_updated_at
  BEFORE UPDATE ON fastmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fastmail_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_accounts_all" ON fastmail_accounts;
CREATE POLICY "fastmail_accounts_all" ON fastmail_accounts
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


CREATE TABLE IF NOT EXISTS fastmail_exclusions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL CHECK (type IN ('domain', 'email')),
  value      TEXT        NOT NULL UNIQUE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fastmail_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_exclusions_all" ON fastmail_exclusions;
CREATE POLICY "fastmail_exclusions_all" ON fastmail_exclusions
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


CREATE TABLE IF NOT EXISTS fastmail_sync_state (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID        NOT NULL UNIQUE
                    REFERENCES fastmail_accounts(id) ON DELETE CASCADE,
  jmap_account_id   TEXT,
  inbox_query_state TEXT,
  sent_query_state  TEXT,
  research_query_state TEXT,                                -- JMAP incremental marker for the research folder
  last_synced_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER fastmail_sync_state_updated_at
  BEFORE UPDATE ON fastmail_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fastmail_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_sync_state_all" ON fastmail_sync_state;
CREATE POLICY "fastmail_sync_state_all" ON fastmail_sync_state
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));


-- ============================================================
-- DISCOVERY INTERVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_interviews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID        REFERENCES contacts(id)  ON DELETE CASCADE,
  company_id      UUID        REFERENCES companies(id) ON DELETE SET NULL,
  interview_date  TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  channel         TEXT,
  notes           TEXT,
  pain_points     TEXT[]      DEFAULT '{}',
  trigger_event   trigger_event_type,
  email_thread_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER discovery_interviews_updated_at
  BEFORE UPDATE ON discovery_interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_di_contact ON discovery_interviews(contact_id);
CREATE INDEX IF NOT EXISTS idx_di_company ON discovery_interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_di_date    ON discovery_interviews(interview_date DESC);

ALTER TABLE discovery_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "discovery_interviews_all" ON discovery_interviews;
CREATE POLICY "discovery_interviews_all" ON discovery_interviews
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PAIN POINT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS pain_point_log (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_id  UUID        REFERENCES discovery_interviews(id) ON DELETE CASCADE,
  pain_point    TEXT        NOT NULL,
  change_type   TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppl_interview ON pain_point_log(interview_id);

CREATE OR REPLACE FUNCTION log_pain_points() RETURNS TRIGGER AS $$
DECLARE
  pp TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pain_points IS NOT NULL THEN
      FOREACH pp IN ARRAY NEW.pain_points LOOP
        INSERT INTO pain_point_log(interview_id, pain_point, change_type, changed_at)
        VALUES (NEW.id, pp, 'insert', NOW());
      END LOOP;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.pain_points IS DISTINCT FROM OLD.pain_points THEN
    IF NEW.pain_points IS NOT NULL THEN
      FOREACH pp IN ARRAY NEW.pain_points LOOP
        INSERT INTO pain_point_log(interview_id, pain_point, change_type, changed_at)
        VALUES (NEW.id, pp, 'update', NOW());
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER pain_points_audit
  AFTER INSERT OR UPDATE ON discovery_interviews
  FOR EACH ROW EXECUTE FUNCTION log_pain_points();

ALTER TABLE pain_point_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pain_point_log_all" ON pain_point_log;
CREATE POLICY "pain_point_log_all" ON pain_point_log
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- SEGMENT SCORECARDS
-- ============================================================

CREATE TABLE IF NOT EXISTS segment_scorecards (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_name        TEXT        UNIQUE NOT NULL,
  need_score          INTEGER     CHECK (need_score BETWEEN 1 AND 5),
  access_score        INTEGER     CHECK (access_score BETWEEN 1 AND 5),
  planned_interviews  INTEGER     NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER segment_scorecards_updated_at
  BEFORE UPDATE ON segment_scorecards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE segment_scorecards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "segment_scorecards_all" ON segment_scorecards;
CREATE POLICY "segment_scorecards_all" ON segment_scorecards
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PHASE 2 — PROFESSIONAL PRESENCE & TESTING
-- ============================================================


-- ============================================================
-- PAIN POINTS (normalised from discovery_interviews.pain_points[])
-- ============================================================

CREATE TABLE IF NOT EXISTS pain_points (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id  UUID        NOT NULL REFERENCES discovery_interviews(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_interview ON pain_points(interview_id);

ALTER TABLE pain_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pain_points_all" ON pain_points;
CREATE POLICY "pain_points_all" ON pain_points
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- CORPORATE LEXICON
-- ============================================================

CREATE TABLE IF NOT EXISTS corporate_lexicon (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  term              TEXT        NOT NULL,
  professional_term TEXT        NOT NULL,
  definition        TEXT,
  category          TEXT,
  example_usage     TEXT,
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'approved', 'deprecated')),
  version           INTEGER     NOT NULL DEFAULT 1,
  created_by        UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by       UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER corporate_lexicon_updated_at
  BEFORE UPDATE ON corporate_lexicon
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_lexicon_status   ON corporate_lexicon(status);
CREATE INDEX IF NOT EXISTS idx_lexicon_category ON corporate_lexicon(category);
CREATE INDEX IF NOT EXISTS idx_lexicon_fts
  ON corporate_lexicon USING gin(to_tsvector('english', coalesce(term,'') || ' ' || coalesce(professional_term,'')));

ALTER TABLE corporate_lexicon ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "corporate_lexicon_all" ON corporate_lexicon;
CREATE POLICY "corporate_lexicon_all" ON corporate_lexicon
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- MVP TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS mvp_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  type        TEXT        NOT NULL CHECK (type IN ('one_pager', 'briefing_deck')),
  title       TEXT        NOT NULL,
  description TEXT,
  tags        TEXT[]      DEFAULT '{}',
  created_by  UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER mvp_templates_updated_at
  BEFORE UPDATE ON mvp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_mvp_templates_type ON mvp_templates(type);

ALTER TABLE mvp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mvp_templates_all" ON mvp_templates;
CREATE POLICY "mvp_templates_all" ON mvp_templates
  FOR ALL USING (auth.role() = 'authenticated');


CREATE TABLE IF NOT EXISTS mvp_template_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID        NOT NULL REFERENCES mvp_templates(id) ON DELETE CASCADE,
  version_number  INTEGER     NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'approved', 'deprecated')),
  content         JSONB       NOT NULL DEFAULT '{}',
  created_by      UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by     UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_mvp_tv_template ON mvp_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_mvp_tv_status   ON mvp_template_versions(template_id, status);

ALTER TABLE mvp_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mvp_template_versions_all" ON mvp_template_versions;
CREATE POLICY "mvp_template_versions_all" ON mvp_template_versions
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- FEEDBACK REPOSITORY
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID        REFERENCES contacts(id)    ON DELETE SET NULL,
  company_id    UUID        REFERENCES companies(id)   ON DELETE SET NULL,
  pain_point_id UUID        REFERENCES pain_points(id) ON DELETE SET NULL,
  source        TEXT        NOT NULL DEFAULT 'interview'
                            CHECK (source IN ('interview', 'survey', 'email', 'testimonial')),
  date_received DATE,
  category      TEXT        NOT NULL DEFAULT 'feature_request'
                            CHECK (category IN ('bug_report', 'feature_request', 'usability', 'testimonial')),
  rating        INTEGER     CHECK (rating BETWEEN 1 AND 5),
  description   TEXT        NOT NULL,
  tags          TEXT[]      DEFAULT '{}',
  sentiment     JSONB,
  created_by    UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_feedback_contact    ON feedback(contact_id);
CREATE INDEX IF NOT EXISTS idx_feedback_company    ON feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_feedback_pain_point ON feedback(pain_point_id);
CREATE INDEX IF NOT EXISTS idx_feedback_date       ON feedback(date_received DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tags       ON feedback USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_feedback_active     ON feedback(created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_all" ON feedback;
CREATE POLICY "feedback_all" ON feedback
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- CONTENT_ITEMS — Insight Pipeline columns
-- ============================================================
-- Augments the existing table so LinkedIn content ideas can
-- reference a specific pain point, carry a priority score,
-- and store research links. Kanban view filters type='linkedin'.

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS pain_point_id   UUID  REFERENCES pain_points(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score           INTEGER,
  ADD COLUMN IF NOT EXISTS research_links  JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- SLIDE BUILDER (migration: 20260422000000_add_slide_builder)
-- ============================================================

CREATE TABLE assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket       TEXT NOT NULL,
  path         TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    BIGINT,
  width        INT,
  height       INT,
  alt_text     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE decks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  org_id       TEXT NOT NULL,
  title        TEXT NOT NULL,
  theme_id     TEXT NOT NULL DEFAULT 'company-default',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'archived')),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deck_slides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id      UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  type         TEXT NOT NULL
               CHECK (type IN ('title','section','agenda','two_column','image_caption','kpi_grid','quote','closing')),
  order_index  INT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_pain_point ON content_items(pain_point_id);

-- ============================================================
-- COMPANY RECORDS (migration: 20260424000000_add_company_records)
-- ============================================================

CREATE TABLE company_record_types (
  key           TEXT        PRIMARY KEY,
  label         TEXT        NOT NULL,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('text', 'markdown', 'image', 'file')),
  category      TEXT        NOT NULL,
  is_singleton  BOOLEAN     NOT NULL DEFAULT false,
  is_builtin    BOOLEAN     NOT NULL DEFAULT false,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE company_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key      TEXT        NOT NULL REFERENCES company_record_types(key) ON DELETE RESTRICT,
  value         TEXT,
  storage_path  TEXT,
  filename      TEXT,
  mime_type     TEXT,
  is_pinned     BOOLEAN     NOT NULL DEFAULT false,
  display_order INT         NOT NULL DEFAULT 0,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPANY DOMAINS (migration: 20260425000000_add_company_domains_and_subscriptions)
-- ============================================================

CREATE TABLE company_domains (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  provider     TEXT,
  renewal_date DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPANY SUBSCRIPTIONS (migration: 20260425000000_add_company_domains_and_subscriptions)
-- ============================================================

CREATE TABLE company_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business      TEXT        NOT NULL,
  website       TEXT,
  service_type  TEXT,
  payment_type  TEXT        CHECK (payment_type IN ('free', 'paid', 'trial')),
  expiry        DATE,
  account_email TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PERSONAS (migration: 20260426000000_add_personas)
-- ============================================================
-- Ideal client archetypes for Della's inference and Content Creator context.
-- No foreign key to contacts — Della infers at query time.

CREATE TYPE persona_market_segment AS ENUM (
  'sme', 'public_company', 'family_office', 'hnw', 'startup', 'superannuation'
);

CREATE TYPE persona_sophistication_level AS ENUM (
  'novice', 'intermediate', 'expert'
);

CREATE TYPE persona_decision_style AS ENUM (
  'data_driven', 'consensus_seeking', 'risk_averse', 'opportunistic', 'process_oriented'
);

CREATE TABLE personas (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name                   TEXT         NOT NULL UNIQUE,
  market_segment         persona_market_segment NOT NULL,
  sophistication_level   persona_sophistication_level NOT NULL DEFAULT 'intermediate',
  estimated_aum          TEXT,
  -- { north_star, anti_goal, decision_making_style, time_horizon, risk_tolerance, custom_traits[] }
  psychographic_profile  JSONB        DEFAULT '{}',
  -- { regulatory_hurdles[], gatekeepers[], preferred_mediums[], approval_layers, budget_approval_cycle }
  strategic_constraints  JSONB        DEFAULT '{}',
  -- { resonant_phrases[], success_indicators[], pain_point_keywords[] }
  success_signals        JSONB        DEFAULT '{}',
  objection_bank         TEXT[]       NOT NULL DEFAULT '{}',
  notes                  TEXT,
  created_by             UUID         REFERENCES team_members(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NEWS ITEMS (migration: 20260426120000_add_news_items)
-- ============================================================
-- Dedicated news aggregation store. Separate from knowledge_items because news
-- is high-volume, ephemeral, and freshness-centric. Promotable to knowledge_items.
-- routines.action_type constraint extended to include 'news_ingest'.

CREATE TYPE news_category AS ENUM (
  'regulatory',    -- ASIC, ATO, APRA, government policy
  'corporate',     -- ASX companies, treasury announcements
  'macro',         -- RBA rates, AUD, inflation, economic indicators
  'international'  -- US/EU/global regulation with AU implications
);

-- One row per upstream source feeding news_items. source_type discriminates the
-- ingestion path: rss/podcast read feed_url, youtube reads youtube_channel_url,
-- email receives newsletters at inbound_address (research+{slug}@<domain>) filed
-- into a Fastmail folder polled by researchMailListener.
-- (migrations: 20260525000000 base, 20260606120000 podcast/youtube,
--  20260617000000 email + Rex rubric curation fields)
CREATE TABLE news_sources (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT        NOT NULL,
  site_url                  TEXT,
  feed_url                  TEXT,                              -- rss/podcast only; UNIQUE where present
  source_type               TEXT        NOT NULL DEFAULT 'rss'
                              CHECK (source_type IN ('rss','podcast','youtube','email')),
  -- podcast / youtube config
  youtube_channel_url       TEXT,
  image_url                 TEXT,                              -- show artwork; set by podcast_ingest from channel-level feed art
  transcribe_with_deepgram  BOOLEAN     NOT NULL DEFAULT false,
  preferred_transcript_lang TEXT        NOT NULL DEFAULT 'en',
  max_backfill_episodes     INT         NOT NULL DEFAULT 25,
  max_episode_age_days      INT,
  -- email config
  slug                      TEXT,                              -- plus-address suffix + URL slug; UNIQUE where present
  inbound_address           TEXT,                              -- research+{slug}@<domain>
  sender_allowlist          TEXT[]      NOT NULL DEFAULT '{}', -- approved From addresses/domains
  -- shared curation (Rex rubric)
  tier                      TEXT        CHECK (tier IS NULL OR tier IN ('tier_1','tier_2','tier_3')),
  relevance_threshold       NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  is_active                 BOOLEAN     NOT NULL DEFAULT true,
  last_scanned_at           TIMESTAMPTZ,
  last_status               TEXT        CHECK (last_status IN ('success','failed')),
  last_error                TEXT,
  created_by                UUID        REFERENCES team_members(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT news_sources_feed_required CHECK (
       (source_type IN ('rss','podcast') AND feed_url IS NOT NULL)
    OR (source_type = 'youtube' AND youtube_channel_url IS NOT NULL)
    OR (source_type = 'email' AND inbound_address IS NOT NULL) )
);
-- UNIQUE (feed_url) WHERE feed_url IS NOT NULL; UNIQUE (slug) WHERE slug IS NOT NULL.

CREATE TABLE news_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  url                  TEXT NOT NULL UNIQUE,        -- synthesized from Message-ID for email items without a URL
  url_hash             TEXT GENERATED ALWAYS AS (md5(url)) STORED,
  source_id            UUID REFERENCES news_sources(id) ON DELETE SET NULL,  -- configured source (email always; rss/podcast going forward)
  source_name          TEXT NOT NULL DEFAULT '',
  ingestion_ref        TEXT,                        -- email Message-ID; idempotency key, deduped before url/semantic dedup
  canonical_url        TEXT,                        -- real "view in browser"/original link (email items)
  author               TEXT,
  published_at         TIMESTAMPTZ,
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_markdown        TEXT,
  summary              TEXT,
  key_points           JSONB NOT NULL DEFAULT '[]'::jsonb,
  category             news_category NOT NULL,
  topic_tags           TEXT[] NOT NULL DEFAULT '{}',
  australian_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  relevance_score      NUMERIC(3,2),
  relevance_reasoning  TEXT,                        -- Rex rubric: candid internal justification
  curator_notes        TEXT,                        -- pre-filled with Rex's suggestion, human-editable
  rex_metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- dimension scores, flags, rubric_version
  has_pdf_attachment   BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_count     INT NOT NULL DEFAULT 0,
  embedding            VECTOR(1536),
  fts                  TSVECTOR GENERATED ALWAYS AS (
                         to_tsvector('english',
                           coalesce(title, '') || ' ' || coalesce(summary, ''))
                       ) STORED,
  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','reviewed','archived','promoted','extraction_failed')),
  knowledge_item_id    UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
  ingested_by          TEXT NOT NULL DEFAULT 'rex',
  routine_id           UUID REFERENCES routines(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One item per (source, Message-ID) for email idempotency; legacy NULL refs unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS news_items_source_ingestion_ref_uniq
  ON news_items (source_id, ingestion_ref) WHERE ingestion_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS news_items_source_idx ON news_items (source_id);

-- RPC: semantic search on news_items
CREATE OR REPLACE FUNCTION vector_search_news(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT   DEFAULT 0.7,
  match_count      INT     DEFAULT 20,
  filter_category  TEXT    DEFAULT NULL,
  filter_days      INT     DEFAULT 30
)
RETURNS TABLE (
  id UUID, title TEXT, summary TEXT, category news_category,
  published_at TIMESTAMPTZ, url TEXT, similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT id, title, summary, category, published_at, url,
         1 - (embedding <=> query_embedding) AS similarity
  FROM news_items
  WHERE embedding IS NOT NULL
    AND (filter_category IS NULL OR category::TEXT = filter_category)
    AND (filter_days IS NULL
         OR published_at >= NOW() - (filter_days || ' days')::INTERVAL
         OR published_at IS NULL)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;


-- ============================================================
-- PRODUCTS & SERVICES
-- ============================================================

CREATE TABLE IF NOT EXISTS products_services (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name                 TEXT        NOT NULL,
  company_id           UUID        REFERENCES companies(id) ON DELETE SET NULL,
  business_name        TEXT,
  australian_owned     BOOLEAN     NOT NULL DEFAULT FALSE,
  category             TEXT        CHECK (category IN (
                         'custody', 'exchange', 'wallet_software', 'wallet_hardware',
                         'payment_processing', 'treasury_management', 'education',
                         'consulting', 'insurance', 'lending', 'other'
                       )),
  description          TEXT,
  logo_url             TEXT,
  product_image_url    TEXT,
  key_relationship_id  UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_by           UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Child: referral agreements
CREATE TABLE IF NOT EXISTS product_referral_agreements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id UUID        NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  agreement_type     TEXT        CHECK (agreement_type IN (
                       'referral_fee', 'revenue_share', 'affiliate', 'strategic', 'other'
                     )),
  counterparty_name  TEXT,
  fee_structure      TEXT,
  percentage         NUMERIC(5,2),
  active             BOOLEAN     NOT NULL DEFAULT TRUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: key contacts
CREATE TABLE IF NOT EXISTS product_key_contacts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id UUID        NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  contact_id         UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role               TEXT        CHECK (role IN ('primary', 'technical', 'sales', 'support', 'other')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_service_id, contact_id)
);


-- ============================================================
-- ADVISORS & PARTNERS
-- ============================================================

CREATE TABLE IF NOT EXISTS advisors_partners (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name                TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('advisor', 'partner')),
  company_id          UUID        REFERENCES companies(id) ON DELETE SET NULL,
  specialization      TEXT,
  engagement_model    TEXT        CHECK (engagement_model IN (
                        'ongoing_retainer', 'project_based', 'ad_hoc',
                        'revenue_share', 'honorary'
                      )),
  rate_notes          TEXT,
  bio                 TEXT,
  logo_url            TEXT,
  website             TEXT,
  linkedin_url        TEXT,
  key_relationship_id UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by          UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: key contacts
CREATE TABLE IF NOT EXISTS advisor_partner_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_partner_id  UUID        NOT NULL REFERENCES advisors_partners(id) ON DELETE CASCADE,
  contact_id          UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (advisor_partner_id, contact_id)
);

-- ============================================================
-- PLATFORM FILES (migration: 20260427120000_add_platform_files)
-- General-purpose file library. Separate from slide-assets.
-- ============================================================

CREATE TABLE platform_files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT        NOT NULL DEFAULT 'bts',
  name              TEXT        NOT NULL,           -- display name (renameable)
  original_filename TEXT        NOT NULL,           -- filename as uploaded
  bucket            TEXT        NOT NULL DEFAULT 'platform-files',
  storage_path      TEXT        NOT NULL,
  mime_type         TEXT        NOT NULL,
  byte_size         BIGINT,
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  is_public         BOOLEAN     NOT NULL DEFAULT false,
  uploaded_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_files_org     ON platform_files(org_id);
CREATE INDEX idx_platform_files_created ON platform_files(created_at DESC);
CREATE INDEX idx_platform_files_tags    ON platform_files USING GIN(tags);

CREATE TRIGGER platform_files_updated_at
  BEFORE UPDATE ON platform_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE platform_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_files_all" ON platform_files
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PLATFORM FILES — STORAGE BUCKET + POLICIES
-- (migration: 20260428120000_fix_platform_files_storage_rls)
-- createSignedUploadUrl checks storage.objects INSERT policy
-- before issuing a token, so uploads require these policies.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('platform-files', 'platform-files', false, 52428800, null)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "platform_files_objects_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'platform-files');

CREATE POLICY "platform_files_objects_select" ON storage.objects
  FOR SELECT TO authenticated, service_role
  USING (bucket_id = 'platform-files');

CREATE POLICY "platform_files_objects_update" ON storage.objects
  FOR UPDATE TO authenticated, service_role
  USING (bucket_id = 'platform-files')
  WITH CHECK (bucket_id = 'platform-files');

CREATE POLICY "platform_files_objects_delete" ON storage.objects
  FOR DELETE TO authenticated, service_role
  USING (bucket_id = 'platform-files');

-- ============================================================
-- PLATFORM FILES — PUBLIC SHARE ACCESS
-- (migration: 20260621120000_platform_files_public_share)
-- The /share/<id> route resolves files for anon visitors, but
-- only while the file is public. Flipping back to private revokes.
-- ============================================================

CREATE POLICY "platform_files_public_select" ON platform_files
  FOR SELECT TO anon
  USING (is_public = true);

CREATE POLICY "platform_files_objects_public_select" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'platform-files'
    AND EXISTS (
      SELECT 1 FROM platform_files pf
      WHERE pf.storage_path = storage.objects.name
        AND pf.is_public = true
    )
  );

-- ============================================================
-- DOCUMENTS — general-purpose document writing
-- (migration: 20260429000000_add_documents_table)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  type        text NOT NULL CHECK (type IN ('report','proposal','brief','memo','strategy')),
  title       text NOT NULL,
  description text,
  tags        text[] NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  content        jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES auth.users(id),
  approved_by    uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage documents"
  ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Team members can manage document versions"
  ON document_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- CONTENT EMBEDDINGS (migration: 20260531000000_add_content_embeddings)
-- ============================================================
-- RAG vector store for the newsletter workflow. Indexes content_items and
-- interactions; embeddings are (re)generated in the app layer by
-- contentEmbeddingListener, not a DB trigger. Search via the
-- vector_search_content RPC.

CREATE TABLE content_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  TEXT NOT NULL CHECK (source_table IN ('content_items', 'interactions')),
  source_id     UUID NOT NULL,
  chunk_index   INT NOT NULL DEFAULT 0,
  chunk_text    TEXT NOT NULL,
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Indexes: content_embeddings_source_idx (source_table, source_id),
--          content_embeddings_embedding_idx HNSW (embedding vector_cosine_ops)
-- RPC: vector_search_content(query_embedding, match_threshold, match_count, filter_days, filter_source)


-- ============================================================
-- NEWSLETTER RUNS (migration: 20260531000001_add_newsletter_runs)
-- ============================================================
-- One row per newsletter workflow execution. Tracks the run lifecycle incl. the
-- two human suspend gates, ties the run to its Mastra workflow_run_id for
-- resume, and records the editorial scorecard + final content_item.

CREATE TABLE newsletter_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id     TEXT UNIQUE NOT NULL,
  trigger_source      TEXT NOT NULL CHECK (trigger_source IN ('signal', 'schedule', 'web')),
  time_range          TEXT NOT NULL,
  story_count_target  INT NOT NULL,
  word_count_target   INT NOT NULL,
  audience_context    TEXT,
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'suspended_gate1', 'suspended_gate2',
                                        'suspended_hold', 'completed', 'failed', 'cancelled',
                                        'no_stories')),
  approved_story_ids  TEXT[],
  content_item_id     UUID REFERENCES content_items(id) ON DELETE SET NULL,
  requested_by        UUID REFERENCES team_members(id),
  requested_by_signal TEXT,
  shortlist           JSONB DEFAULT '[]',
  editorial_scores    JSONB DEFAULT '{}',
  total_word_count    INT,
  -- Web approval path (migration: 20260601000000_add_newsletter_web_gates):
  -- gate context persisted on suspend + the web → agents decision handoff slot.
  gate_message        TEXT,
  gate_draft_markdown TEXT,
  pending_decision    JSONB,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
);
-- Realtime-enabled so the /content page can show in-progress run status and
-- the agents-side gate listener can react to web decisions.

-- ============================================================
-- SOCIAL CAMPAIGNS (migration: 20260622000000_add_campaigns_schema)
-- ============================================================
-- The strategy layer above the content pipeline. social_accounts / brand_voice /
-- voice_snippets already exist (voice foundations, above). A campaign produces
-- ordered beats; each beat fans out into per-account, per-platform variants that
-- reuse content_items. Two new agents (Margot, Lex) drive it via Mastra workflows.

CREATE TABLE campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  name                 TEXT NOT NULL,
  objective            TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'strategy_approved', 'plan_approved',
                                         'active', 'paused', 'completed', 'archived')),
  strategy             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- locks at app layer once plan_approved
  audience_filter      JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_persona     TEXT,
  start_date           DATE,
  duration_weeks       INT,
  posts_per_week       INT,
  post_slots           JSONB NOT NULL DEFAULT '{}'::jsonb,
  timezone             TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  strategy_approved_at TIMESTAMPTZ,
  strategy_approved_by UUID REFERENCES team_members(id),
  plan_approved_at     TIMESTAMPTZ,
  plan_approved_by     UUID REFERENCES team_members(id),
  -- Step 7 strategy-workflow gate columns (20260623000000): the wizard can't
  -- reach the agents server, so the campaign row carries the gate handoff. A
  -- pending_decision of { decision: 'start' } launches the run; a gate resume
  -- payload advances it; gate_state holds the suspend preview; schedule_plan
  -- holds the approved (beat × account) schedule for Step 8 fan-out.
  workflow_run_id      TEXT,
  gate_state           JSONB,
  pending_decision     JSONB,
  schedule_plan        JSONB,
  created_by           UUID REFERENCES team_members(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_start  ON campaigns(start_date);

-- Realtime (20260624000000): the strategyGateWeb / variantGateWeb listeners react
-- to pending_decision writes via postgres_changes, so campaigns and content_items
-- must be in the publication. REPLICA IDENTITY FULL carries the JSONB gate columns.
ALTER TABLE campaigns REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER TABLE content_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE content_items;

-- Join: which accounts participate in a campaign (each beat fans out to all).
CREATE TABLE campaign_accounts (
  campaign_id       UUID NOT NULL REFERENCES campaigns(id)       ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, social_account_id)
);

CREATE INDEX idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);

-- Ordered platform-agnostic core messages. Variants live in content_items.
CREATE TABLE campaign_beats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence      INT  NOT NULL,
  title         TEXT,
  core_message  TEXT NOT NULL,
  rationale     TEXT,
  prefer_thread BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'generating', 'variants_ready', 'complete')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER campaign_beats_updated_at
  BEFORE UPDATE ON campaign_beats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_campaign_beats_campaign ON campaign_beats(campaign_id);

-- Keyed reusable disclaimers Lex selects from. Shared across Social/Contracts/Compliance.
CREATE TABLE compliance_snippets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT,
  body        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  applies_to  TEXT[] NOT NULL DEFAULT '{}',
  created_by  UUID REFERENCES team_members(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER compliance_snippets_updated_at
  BEFORE UPDATE ON compliance_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Editable per-platform limits (enforced in the app, not by constraint).
CREATE TABLE platform_specs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT NOT NULL UNIQUE CHECK (platform IN ('linkedin', 'twitter_x')),
  max_chars           INT NOT NULL,
  premium_max_chars   INT,
  max_thread_segments INT,
  max_images_per_post INT,
  image_specs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  hashtag_guidance    TEXT,
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_specs_updated_at
  BEFORE UPDATE ON platform_specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- content_items reused AS the variant: campaign/beat/account links + thread,
-- compliance, and approval state. source CHECK extended with 'margot','charlie'.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS campaign_id               UUID REFERENCES campaigns(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beat_id                   UUID REFERENCES campaign_beats(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_account_id         UUID REFERENCES social_accounts(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_thread                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS char_count                INT,
  ADD COLUMN IF NOT EXISTS compliance_status         TEXT
    CHECK (compliance_status IN ('pending', 'cleared', 'flagged', 'overridden')),
  ADD COLUMN IF NOT EXISTS compliance_classification TEXT
    CHECK (compliance_classification IN ('educational', 'general_advice', 'personal_opinion')),
  ADD COLUMN IF NOT EXISTS needs_disclaimer          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disclaimer_snippet_id     UUID REFERENCES compliance_snippets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_rationale      TEXT,
  ADD COLUMN IF NOT EXISTS compliance_checked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compliance_overridden_by  UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS approved_by               UUID REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS approved_at               TIMESTAMPTZ;

-- source CHECK now: manual, coordinator_agent, content_agent, archivist_agent, margot, charlie
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_source_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_source_check
  CHECK (source IN ('manual', 'coordinator_agent', 'content_agent', 'archivist_agent', 'margot', 'charlie'));

CREATE INDEX idx_content_items_campaign   ON content_items(campaign_id);
CREATE INDEX idx_content_items_beat       ON content_items(beat_id);
CREATE INDEX idx_content_items_account    ON content_items(social_account_id);
CREATE INDEX idx_content_items_compliance ON content_items(compliance_status);

-- Variant Gate 3 web-approval columns (migration: 20260622020000). The variant
-- editor renders gate_state and writes the decision to pending_decision; the
-- variantGateWeb listener claims it and resumes workflow_run_id. Mirrors the
-- newsletter_runs gate columns.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS workflow_run_id  TEXT,
  ADD COLUMN IF NOT EXISTS gate_state       JSONB,
  ADD COLUMN IF NOT EXISTS pending_decision JSONB;

-- The editor-chosen form of a daily social post (migration: 20260712000000).
-- Plain TEXT (not an enum) — the form vocabulary lives in application code and is
-- expected to grow; the next day's run reads recent forms to bias toward variety.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS post_form TEXT;

-- Ordered child rows of a threaded content_item.
CREATE TABLE thread_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  sequence        INT  NOT NULL,
  body            TEXT NOT NULL,
  char_count      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, sequence)
);

CREATE TRIGGER thread_segments_updated_at
  BEFORE UPDATE ON thread_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_thread_segments_item ON thread_segments(content_item_id);

-- Images at variant level, or (for threads) at segment level. Bytes in the
-- private Supabase bucket via packages/storage; this row holds path + alt + crop.
CREATE TABLE content_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  thread_segment_id UUID REFERENCES thread_segments(id) ON DELETE CASCADE,  -- NULL = applies to the post
  storage_path      TEXT NOT NULL,
  alt_text          TEXT,
  platform_crop     TEXT,
  sort_order        INT NOT NULL DEFAULT 0,
  source            TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'ai_generated')),
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_images_item    ON content_images(content_item_id);
CREATE INDEX idx_content_images_segment ON content_images(thread_segment_id);

-- Manual post-hoc metrics, one row per published variant (UNIQUE), updated in place.
CREATE TABLE post_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  platform        TEXT,
  impressions     INT,
  reactions       INT,
  comments        INT,
  reposts         INT,
  clicks          INT,
  extra           JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     UUID REFERENCES team_members(id)
);

CREATE INDEX idx_post_metrics_item ON post_metrics(content_item_id);

-- Views: campaign progress, the variant matrix, and the ready-to-post queue.
CREATE VIEW v_campaign_overview AS
  SELECT
    c.id, c.name, c.objective, c.status, c.start_date, c.duration_weeks,
    (c.start_date + (c.duration_weeks * 7))                 AS end_date,
    ((c.start_date + (c.duration_weeks * 7)) - CURRENT_DATE) AS days_remaining,
    COUNT(ci.id)                                            AS total_variants,
    COUNT(ci.id) FILTER (WHERE ci.status = 'published')     AS published_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'approved')      AS approved_count,
    COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'review')) AS pending_count,
    COUNT(ci.id) FILTER (WHERE ci.compliance_status = 'flagged') AS flagged_count,
    c.slug
  FROM campaigns c
  LEFT JOIN content_items ci ON ci.campaign_id = c.id
  GROUP BY c.id
  ORDER BY c.start_date DESC;

CREATE VIEW v_campaign_matrix AS
  SELECT
    ci.id, ci.campaign_id, ci.beat_id,
    cb.sequence AS beat_sequence, cb.title AS beat_title,
    sa.id AS account_id, sa.display_name AS account_name, sa.platform,
    ci.type, ci.is_thread, ci.status, ci.scheduled_for,
    ci.compliance_status, ci.compliance_classification, ci.needs_disclaimer, ci.char_count,
    ci.slug
  FROM content_items ci
  JOIN campaign_beats cb  ON cb.id = ci.beat_id
  JOIN social_accounts sa ON sa.id = ci.social_account_id
  WHERE ci.campaign_id IS NOT NULL
  ORDER BY cb.sequence ASC, sa.display_name ASC;

CREATE VIEW v_ready_to_post AS
  SELECT
    ci.id, ci.campaign_id, ci.title, ci.body, ci.type, ci.is_thread, ci.scheduled_for,
    sa.display_name AS account_name, sa.platform, sa.profile_url,
    cs.body AS disclaimer_text
  FROM content_items ci
  JOIN social_accounts sa          ON sa.id = ci.social_account_id
  LEFT JOIN compliance_snippets cs ON cs.id = ci.disclaimer_snippet_id
  WHERE ci.status = 'approved' AND ci.campaign_id IS NOT NULL
  ORDER BY ci.scheduled_for ASC NULLS LAST;

-- RLS: authenticated OR service_role, consistent with the rest of the platform.
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_beats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_specs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_segments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_all"           ON campaigns           FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "campaign_accounts_all"   ON campaign_accounts   FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "campaign_beats_all"      ON campaign_beats      FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "compliance_snippets_all" ON compliance_snippets FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "platform_specs_all"      ON platform_specs      FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "thread_segments_all"     ON thread_segments     FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "content_images_all"      ON content_images      FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "post_metrics_all"        ON post_metrics        FOR ALL USING (auth.role() IN ('authenticated', 'service_role')) WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
-- PODCAST INGESTION (migration: 20260606000000 add_podcast_ingestion)
-- ============================================================
-- news_sources gains a source_type discriminator + podcast config (feed_url is
-- now nullable; youtube sources use youtube_channel_url instead):
--   source_type TEXT 'rss'|'podcast'|'youtube' (default 'rss')
--   youtube_channel_url, transcribe_with_deepgram (default false),
--   preferred_transcript_lang (default 'en'), max_backfill_episodes (default 25),
--   max_episode_age_days

-- One row per ingested episode; transcript_text lives here for display + FTS,
-- embeddings live in transcript_segments.
CREATE TABLE podcast_episodes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- human-friendly URL handle (auto-generated on insert; see 20260716020000 migration)
  source_id             UUID REFERENCES news_sources(id) ON DELETE SET NULL,
  guid                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  episode_url           TEXT,
  audio_url             TEXT,
  audio_mime_type       TEXT,
  duration_seconds      INT,
  youtube_url           TEXT,
  season                INT,
  episode_number        INT,
  image_url             TEXT,
  published_at          TIMESTAMPTZ,
  transcript_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending','resolving','transcribing','available','failed','skipped')),
  transcript_source     TEXT CHECK (transcript_source IN ('feed_tag','youtube','deepgram','manual')),
  transcript_format     TEXT CHECK (transcript_format IN ('json','vtt','srt','html','text')),
  transcript_lang       TEXT,
  transcript_text       TEXT,
  transcript_raw_url    TEXT,
  has_timestamps        BOOLEAN NOT NULL DEFAULT false,
  deepgram_request_id   TEXT,
  transcript_error      TEXT,
  ingestion_origin      TEXT NOT NULL DEFAULT 'feed' CHECK (ingestion_origin IN ('feed','brief','manual')),
  curator_note          TEXT,
  topic_tags            TEXT[] NOT NULL DEFAULT '{}',
  transcript_fetched_at TIMESTAMPTZ,
  embedded_at           TIMESTAMPTZ,
  -- Web-requested re-run / intelligence action; claimed atomically by
  -- podcastActionListener (see 20260607000000 + 20260716010000).
  pending_action        TEXT CHECK (pending_action IN ('refetch','deepgram','retry','summarize')),
  -- Episode intelligence (Phase 1: summary). The draft lives in episode_summary;
  -- summary_status gates client visibility (publish-wall). See 20260716010000.
  episode_summary       TEXT,
  summary_status        TEXT NOT NULL DEFAULT 'none' CHECK (summary_status IN ('none','proposed','approved')),
  summary_lex_verdict   JSONB,
  summary_generated_at  TIMESTAMPTZ,
  summary_approved_at   TIMESTAMPTZ,
  summary_approved_by   UUID REFERENCES team_members(id),
  fts                   TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(transcript_text, ''))) STORED,
  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dedupe: UNIQUE (source_id, guid) WHERE source_id IS NOT NULL (feed episodes);
-- UNIQUE (guid) WHERE source_id IS NULL (ad-hoc/brief episodes). Plus indexes on
-- deepgram_request_id, transcript_status, published_at, and a GIN index on fts.

-- Chunked, embedded transcript content for RAG. start/end seconds NULL when the
-- source had no timestamps; present for json/vtt/srt/deepgram (deep-links).
CREATE TABLE transcript_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  segment_index INT NOT NULL,
  start_seconds NUMERIC(10,2),
  end_seconds   NUMERIC(10,2),
  speaker       TEXT,
  content       TEXT NOT NULL,
  token_count   INT,
  embedding     VECTOR(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes: btree on episode_id; HNSW (embedding vector_cosine_ops).

-- Views: v_podcast_ingestion_status (health dashboard) and
-- v_episodes_awaiting_action (stuck/errored episodes for Simon).
-- RPC: vector_search_transcripts(query_embedding, match_threshold, match_count,
-- filter_days) — cosine search returning one row per matching segment, joined to
-- episode + source for title/provenance/timestamp.


-- ============================================================
-- ECONOMIC INDICATORS (migration: 20260620000000_add_economic_indicators)
-- ============================================================
-- Slow-moving macro series (money supply, inflation, policy rates) persisted as
-- a time series, beneath the live tickers. Source-discriminated registry +
-- ingestion-agnostic observation table with revision/supersession handling.
-- Spec: docs/features/economic-indicators/.

-- Registry: one row per tracked series.
CREATE TABLE economic_indicators (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  short_label            TEXT NOT NULL,
  region                 TEXT NOT NULL CHECK (region IN ('au','us','global')),
  category               TEXT NOT NULL CHECK (category IN ('policy_rate','money_supply','inflation','activity')),
  provider               TEXT NOT NULL CHECK (provider IN ('fred','rba','abs','oecd')),
  provider_series_code   TEXT,                     -- FRED series_id, e.g. 'M2SL'
  provider_table_ref     TEXT,                     -- RBA/ABS table or dataflow ref, e.g. 'D3'
  unit                   TEXT NOT NULL,            -- 'percent','aud_billion','usd_billion','index'
  decimals               INT  NOT NULL DEFAULT 2,
  -- Operational poll cadence (how often we hit the API), NOT the data's natural
  -- frequency. Natural frequency is computed in v_indicator_latest, never stored.
  poll_frequency         TEXT NOT NULL DEFAULT 'daily' CHECK (poll_frequency IN ('daily','weekly')),
  alert_on_new_print     BOOLEAN NOT NULL DEFAULT TRUE,
  alert_change_threshold NUMERIC,                  -- NULL = print-only
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  created_by             UUID REFERENCES team_members(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Observation time series: one row per (indicator, period, vintage). Append/
-- supersede-only — no updated_at, never edited in place (clean audit trail).
-- period_date is normalised to the FIRST day of the period (see adapter-contract.md);
-- released_at is when the provider published (v1: workflow substitutes fetch date).
CREATE TABLE indicator_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id     UUID NOT NULL REFERENCES economic_indicators(id) ON DELETE CASCADE,
  period_date      DATE NOT NULL,
  value            NUMERIC(18,4) NOT NULL,
  released_at      DATE NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,   -- latest vintage of this period
  is_revision      BOOLEAN NOT NULL DEFAULT FALSE,  -- supersedes an earlier value for this period
  superseded_value NUMERIC(18,4),
  source           TEXT NOT NULL CHECK (source IN ('fred','rba','abs','oecd','manual')),
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Trigger: economic_indicators_updated_at (BEFORE UPDATE → update_updated_at()).
-- Indexes: idx_indicator_obs_indicator (indicator_id);
--          idx_indicator_obs_period (indicator_id, period_date DESC);
--          idx_indicator_obs_current (indicator_id, is_current) WHERE is_current;
--          uq_indicator_obs_vintage UNIQUE (indicator_id, period_date, released_at);
--          idx_economic_indicators_region (region);
--          idx_economic_indicators_active (is_active) WHERE is_active.
-- RLS: "<table>_all" FOR ALL to authenticated + service_role (agents poll via service_role).
-- Seed: six v1 indicators (RBA cash rate, Fed funds, US M2, AU broad money, US CPI;
--       AU CPI seeded is_active=false until the ABS adapter exists).
--       + activity category (migration 20260621000000): US Manufacturing Activity
--       (Philly Fed, FRED, live) and AU Business Confidence (OECD, is_active=false
--       until an 'oecd' SDMX adapter exists).

-- Views:
--   v_indicator_series — current-vintage observations for an indicator, oldest→newest
--     (sparklines + Rex). Columns: indicator_id, short_label, period_date, value, released_at.
--   v_indicator_latest — one row per active indicator: current value, change-since-prior,
--     YoY (via a calendar-year period_date join — frequency-agnostic, gap-tolerant),
--     and a computed cadence (median gap between PERIODS → expected_next_release).
--     Cadence is derived from period_date spacing, not released_at: v1 substitutes
--     the fetch date for released_at, so a backfill shares one release date and its
--     release gaps are all 0 (migration 20260707000000). Nothing stored. Component
--     picks the YoY column by category: yoy_change (policy_rate, pp) vs
--     yoy_pct_change (inflation = the rate; money_supply = the debasement rate).


-- ============================================================
-- ON-CHAIN INDICATORS (migration: 20260621170000_add_onchain_indicators)
-- ============================================================
-- Bitcoin network & on-chain metrics (hash rate, difficulty, Hash Ribbons, fee
-- share, pool concentration, MVRV, realised price, active addresses). Sibling of
-- economic_indicators, reusing its registry + observation-series pattern, but a
-- SEPARATE table: on-chain data is daily (no period-vs-release gap) and several
-- DISPLAY metrics are DERIVED from others. Spec: docs/features/onchain-indicators/.
--
-- STORAGE: onchain_observations holds ONLY raw fetched series. Derived display
-- metrics (fee_share, realised_price, hash_ribbons) are computed in the views,
-- never stored. MVRV is fetched directly from Coin Metrics (a normal fetched row).

-- Registry: one row per indicator — display metrics AND the raw inputs that feed
-- derived ones (is_displayed=false). Derived rows have provider=NULL + a
-- derivation_spec and are never polled.
CREATE TABLE onchain_indicators (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   TEXT NOT NULL UNIQUE,          -- stable slug, e.g. 'hash_rate'
  name                  TEXT NOT NULL,
  short_label           TEXT NOT NULL,
  metric_group          TEXT NOT NULL CHECK (metric_group IN ('network_security','behaviour_valuation','market_snapshot','trend_valuation')),
  derivation            TEXT NOT NULL DEFAULT 'fetched' CHECK (derivation IN ('fetched','derived')),
  provider              TEXT CHECK (provider IN ('mempool','coinmetrics','coingecko','alternative_me')),  -- NULL for derived
  provider_metric_code  TEXT,                          -- e.g. CM 'CapRealUSD'; NULL for derived
  derivation_spec       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- documents derived formula; NOT executed
  unit                  TEXT NOT NULL,                 -- 'eh_s','ratio','usd','percent','count','signal','btc'
  decimals              INT  NOT NULL DEFAULT 2,
  poll_frequency        TEXT NOT NULL DEFAULT 'daily' CHECK (poll_frequency IN ('daily')),
  is_displayed          BOOLEAN NOT NULL DEFAULT TRUE, -- true = headline card; false = raw input
  alert_config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- what proposes a content beat
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_by            UUID REFERENCES team_members(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Derived rows carry no provider; fetched rows must have one.
  CONSTRAINT onchain_derivation_provider CHECK (
    (derivation = 'derived' AND provider IS NULL) OR
    (derivation = 'fetched' AND provider IS NOT NULL)
  )
);

-- Observation time series: raw fetched values only. One row per (indicator, day,
-- vintage). Append/supersede-only — no updated_at. observed_at is the UTC day the
-- value pertains to. value is NUMERIC(24,6) (realised cap ~1e12; ratios precise).
CREATE TABLE onchain_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id     UUID NOT NULL REFERENCES onchain_indicators(id) ON DELETE CASCADE,
  observed_at      DATE NOT NULL,
  value            NUMERIC(24,6) NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,   -- latest vintage for this observed_at
  is_revision      BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_value NUMERIC(24,6),
  source           TEXT NOT NULL CHECK (source IN ('mempool','coinmetrics','coingecko','alternative_me')),
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Trigger: onchain_indicators_updated_at (BEFORE UPDATE → update_updated_at()).
-- Indexes: idx_onchain_obs_indicator (indicator_id);
--          idx_onchain_obs_observed (indicator_id, observed_at DESC);
--          idx_onchain_obs_current (indicator_id, is_current) WHERE is_current;
--          uq_onchain_obs_vintage UNIQUE (indicator_id, observed_at, ingested_at);
--          idx_onchain_indicators_group (metric_group);
--          idx_onchain_indicators_active (is_active) WHERE is_active;
--          idx_onchain_indicators_displayed (is_displayed) WHERE is_displayed.
-- RLS: "<table>_all" FOR ALL to authenticated + service_role (agents poll via service_role).
-- Seed: 8 display metrics (hash_rate, next_difficulty_adjustment, pool_concentration_top,
--       fee_share[derived], hash_ribbons[derived], mvrv, realised_price[derived],
--       active_addresses) + 5 raw inputs (miner_revenue_total, miner_fees_total,
--       realised_cap, supply, difficulty).
-- Migration 20260704160000_add_bitcoin_snapshot_indicators: widened provider/source
--   CHECKs (+coingecko, +alternative_me) and metric_group CHECK (+market_snapshot);
--   seeded block_height (mempool), btc_price_aud (coingecko), fear_greed
--   (alternative_me). These three are displayed LIVE (fetched at send time) in the
--   market_report email rather than read from the last poll — see
--   apps/agents/src/lib/report/runMarketReport.ts — but still accumulate daily
--   history here via the normal onchain_poll routine.
-- Migration 20260708000000_add_btc_trend_valuation: added metric_group 'trend_valuation'
--   and seeded a BTC/USD close raw input (btc_price_usd, CM PriceUSD, is_displayed=false)
--   plus 8 derived display metrics — ma_50d, ma_200d, ma_200w, mayer_multiple, ma_cross
--   (signal), rsi_14, realized_vol_30d, drawdown_from_high — all computed in v_btc_trend.
--   Bumped the onchain_poll routine's backfill_days to 2600 so the 200-week window and
--   the drawdown high populate on first ingest. The coinmetrics adapter now sends an
--   explicit start_time window (see adapter note) so a deep backfill returns RECENT days.

-- Views:
--   v_onchain_series — current observations per indicator, oldest→newest (sparklines + Rex).
--     Columns: indicator_id, key, short_label, observed_at, value.
--   v_hash_ribbons — 30d/60d MA of hash_rate, spread_pct, and signal
--     (capitulation/recovery/neutral). NB: ROWS BETWEEN N PRECEDING counts ROWS not
--     calendar days — assumes daily-contiguous hash_rate rows (a polling gap shortens
--     the window). Only emits once 60 days of history exist.
--   v_btc_trend — per-day trend metrics from the btc_price_usd close series:
--     ma_50d, ma_200d, ma_200w (1400-day SMA proxy), mayer_multiple, ma_cross_spread_pct
--     + above_200d flag, realized_vol_30d (annualised), rsi_14 (Cutler SMA), drawdown_pct
--     (from running high). Same ROWS-window caveat as v_hash_ribbons. Each metric is
--     NULL until its window has enough contiguous days.
--   v_btc_trend_metrics — latest v_btc_trend row unpivoted to one row per trend metric,
--     shaped exactly like v_onchain_dashboard (with day-over-day deltas; the ma_cross
--     signal is above/below/cross_up/cross_down from the latest-vs-prior transition).
--   v_onchain_dashboard — one row per DISPLAY metric (fetched + derived), uniform shape:
--     key, name, short_label, metric_group, unit, decimals, value, observed_at,
--     change_since_prior, pct_change_since_prior, days_since_observed, signal. Fetched
--     read their latest current observation (with day-over-day deltas); derived
--     (fee_share, realised_price, hash_ribbons) are computed inline; the trend_valuation
--     rows are unioned in from v_btc_trend_metrics. Non-trend derived metrics carry NULL
--     deltas; trend metrics carry deltas.
