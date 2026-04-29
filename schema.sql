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
  agent_name        TEXT NOT NULL
                    CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della')),
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
                  CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex', 'della')),
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
                      ('simon','roger','archie','petra','bruno','charlie','rex','della')),
  action_type       TEXT NOT NULL
                    CHECK (action_type IN ('research_digest','monitor_change')),
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
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username          TEXT        NOT NULL UNIQUE,
  token             TEXT        NOT NULL,
  display_name      TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  watched_addresses TEXT[]      NOT NULL DEFAULT '{}', -- empty = all; non-empty = filter by these aliases
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE news_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  url                  TEXT NOT NULL UNIQUE,
  url_hash             TEXT GENERATED ALWAYS AS (md5(url)) STORED,
  source_name          TEXT NOT NULL DEFAULT '',
  published_at         TIMESTAMPTZ,
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_markdown        TEXT,
  summary              TEXT,
  key_points           JSONB NOT NULL DEFAULT '[]'::jsonb,
  category             news_category NOT NULL,
  topic_tags           TEXT[] NOT NULL DEFAULT '{}',
  australian_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  relevance_score      NUMERIC(3,2),
  embedding            VECTOR(1536),
  fts                  TSVECTOR GENERATED ALWAYS AS (
                         to_tsvector('english',
                           coalesce(title, '') || ' ' || coalesce(summary, ''))
                       ) STORED,
  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','reviewed','archived','promoted')),
  knowledge_item_id    UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
  ingested_by          TEXT NOT NULL DEFAULT 'rex',
  routine_id           UUID REFERENCES routines(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
-- DOCUMENTS — general-purpose document writing
-- (migration: 20260429000000_add_documents_table)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
