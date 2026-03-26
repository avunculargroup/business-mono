-- ============================================================
-- SEED DATA
-- ============================================================
-- Applied automatically by `supabase db reset` for local dev.
-- For remote, apply manually: psql $DATABASE_URL < supabase/seed.sql
-- All inserts use ON CONFLICT DO NOTHING for safety.
-- ============================================================


-- ============================================================
-- RESEARCHER CAPABILITIES
-- ============================================================

INSERT INTO platform_capabilities (agent_name, capability, status, phase, tools_required, notes) VALUES
  ('researcher', 'web_search',             'active', 'phase_1', ARRAY['search_web'],                   'Tavily Search API — 1,000 searches/month free tier'),
  ('researcher', 'fact_verification',       'active', 'phase_1', ARRAY['search_web', 'fetch_url'],      'Cross-reference claims across multiple sources'),
  ('researcher', 'url_ingestion',           'active', 'phase_1', ARRAY['fetch_url', 'crawl_structured'], 'Extract clean markdown from URLs for Archivist'),
  ('researcher', 'content_summarisation',   'active', 'phase_1', ARRAY['search_web', 'fetch_url'],      'Structured summaries with key points and sources'),
  ('researcher', 'topic_monitoring',        'active', 'phase_1', ARRAY['search_web'],                   'Scheduled monitoring via research_monitors table')
ON CONFLICT DO NOTHING;
