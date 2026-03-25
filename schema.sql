-- ============================================================
-- INTERNAL BUSINESS PLATFORM — SUPABASE SCHEMA v2
-- Bitcoin Treasury Training & Consulting
-- ============================================================
-- Assumes Supabase Auth is already configured.
-- auth.users is referenced but not created here.
-- Run this in the Supabase SQL editor in order.
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
  name          TEXT NOT NULL,
  industry      TEXT,
  size          TEXT,
  country       TEXT,
  website       TEXT,
  linkedin_url  TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
                  CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript')),
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
                  CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript')),

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
  agent_name        TEXT NOT NULL,
  action            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'auto')),

  trigger_type      TEXT CHECK (trigger_type IN ('call_transcript', 'signal_message', 'manual', 'scheduled')),
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


-- Registry of what the platform can do (Simon's capacity awareness)
CREATE TABLE platform_capabilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      TEXT NOT NULL,
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
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "platform_capabilities_all" ON platform_capabilities
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "capacity_gaps_all" ON capacity_gaps
  FOR ALL USING (auth.role() = 'authenticated');


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
