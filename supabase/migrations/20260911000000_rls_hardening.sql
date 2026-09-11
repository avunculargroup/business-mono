-- ============================================================
-- RLS HARDENING
-- Bitcoin Treasury Solutions — internal platform
-- ============================================================
-- BLOCKER for apps/client. Run before any client user exists.
--
-- Every policy rewritten below granted its table to any
-- authenticated session. That was correct while "authenticated"
-- and "founder" were the same two people. The moment a Minute
-- subscriber authenticates against this project, those
-- expressions hand them the CRM, the agent activity log, every
-- transcript and the whole research register.
--
-- The bundle this migration comes from (docs/features/client-app)
-- named eleven policies, taken from schema.sql. The live
-- catalogue was queried instead, and it carries 114 across 107
-- tables, in two classes:
--
--   100  USING (auth.role() = 'authenticated')
--    14  USING (true), granted to authenticated
--
-- The second class is why this migration was generated rather
-- than transcribed. The bundle's audit query greps for
-- auth.role(), so a policy reading USING (true) — which is more
-- permissive, not less — returns nothing and reads as clean.
-- documents, document_versions, personas, model_configs,
-- platform_files, assets, decks and the company_* tables were all
-- in that blind spot.
--
-- apps/agents is unaffected: it connects with the service role
-- key (packages/db/src/client.ts), which bypasses RLS entirely.
--
-- This migration is correct whether or not apps/client ever
-- ships.
-- ============================================================


-- ------------------------------------------------------------
-- Identity helper
-- ------------------------------------------------------------
-- SECURITY DEFINER matters here and is not decoration.
--
-- team_members has RLS enabled, and the team_members policy below
-- calls this function. A SECURITY INVOKER function would query
-- team_members, which would evaluate the policy, which would call
-- the function, which would query team_members. Infinite
-- recursion, reported as a stack depth error that points nowhere
-- near the cause.
--
-- SECURITY DEFINER runs as the function owner, bypassing RLS on
-- the tables it touches, which breaks the loop.
--
-- SET search_path is required on every SECURITY DEFINER function.
-- Without it the function resolves object names against the
-- caller's search_path, which is a privilege escalation vector.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members WHERE id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_team_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_team_member() TO authenticated;

COMMENT ON FUNCTION is_team_member() IS
  'True when the current JWT subject is a BTS team member. SECURITY DEFINER to avoid RLS recursion on team_members.';


-- ------------------------------------------------------------
-- The two policies deliberately left open
-- ------------------------------------------------------------
-- Neither is touched below. Both are intended, and both are
-- listed here so that a future audit does not "fix" them.
--
--   form_submissions_insert
--     INSERT, role public, WITH CHECK (true). The marketing site
--     posts forms unauthenticated. Insert-only, so it leaks no
--     reads.
--
--   platform_files_public_select
--     SELECT, role anon, USING (is_public = true). This is what
--     share links run on.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- The rewrites
-- ------------------------------------------------------------
-- One team policy per table. Where a table carried a split
-- read/write pair (news_items, content_embeddings,
-- newsletter_runs, transcript_segments, workflow_progress,
-- model_configs, personas) both are dropped and replaced by a
-- single FOR ALL policy: the split distinguished nothing once
-- both halves resolve to the same set of people.
--
-- FOR ALL with USING and no WITH CHECK applies USING to both, so
-- a team member reads and writes and nobody else does either.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "account_feedback_guidelines_all" ON account_feedback_guidelines;
CREATE POLICY "account_feedback_guidelines_team" ON account_feedback_guidelines
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "advisor_partner_contacts_all" ON advisor_partner_contacts;
CREATE POLICY "advisor_partner_contacts_team" ON advisor_partner_contacts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "advisors_partners_all" ON advisors_partners;
CREATE POLICY "advisors_partners_team" ON advisors_partners
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "agent_activity_all" ON agent_activity;
CREATE POLICY "agent_activity_team" ON agent_activity
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "agent_conversations_all" ON agent_conversations;
CREATE POLICY "agent_conversations_team" ON agent_conversations
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "assets_all" ON assets;
CREATE POLICY "assets_team" ON assets
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "brand_assets_all" ON brand_assets;
CREATE POLICY "brand_assets_team" ON brand_assets
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "brand_voice_all" ON brand_voice;
CREATE POLICY "brand_voice_team" ON brand_voice
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "campaign_accounts_all" ON campaign_accounts;
CREATE POLICY "campaign_accounts_team" ON campaign_accounts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "campaign_beats_all" ON campaign_beats;
CREATE POLICY "campaign_beats_team" ON campaign_beats
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "campaigns_all" ON campaigns;
CREATE POLICY "campaigns_team" ON campaigns
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "capacity_gaps_all" ON capacity_gaps;
CREATE POLICY "capacity_gaps_team" ON capacity_gaps
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "champion_events_all" ON champion_events;
CREATE POLICY "champion_events_team" ON champion_events
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "champions_all" ON champions;
CREATE POLICY "champions_team" ON champions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "community_watchlist_all" ON community_watchlist;
CREATE POLICY "community_watchlist_team" ON community_watchlist
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "companies_all" ON companies;
CREATE POLICY "companies_team" ON companies
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_domains_all" ON company_domains;
CREATE POLICY "company_domains_team" ON company_domains
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_former_names_all" ON company_former_names;
CREATE POLICY "company_former_names_team" ON company_former_names
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_listings_all" ON company_listings;
CREATE POLICY "company_listings_team" ON company_listings
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_record_types_all" ON company_record_types;
CREATE POLICY "company_record_types_team" ON company_record_types
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_records_all" ON company_records;
CREATE POLICY "company_records_team" ON company_records
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "company_subscriptions_all" ON company_subscriptions;
CREATE POLICY "company_subscriptions_team" ON company_subscriptions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "compliance_snippets_all" ON compliance_snippets;
CREATE POLICY "compliance_snippets_team" ON compliance_snippets
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "contacts_all" ON contacts;
CREATE POLICY "contacts_team" ON contacts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "content_embeddings_read" ON content_embeddings;
DROP POLICY IF EXISTS "content_embeddings_write" ON content_embeddings;
CREATE POLICY "content_embeddings_team" ON content_embeddings
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "content_feedback_all" ON content_feedback;
CREATE POLICY "content_feedback_team" ON content_feedback
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "content_images_all" ON content_images;
CREATE POLICY "content_images_team" ON content_images
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "content_items_all" ON content_items;
CREATE POLICY "content_items_team" ON content_items
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "corporate_lexicon_all" ON corporate_lexicon;
CREATE POLICY "corporate_lexicon_team" ON corporate_lexicon
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "deck_slides_all" ON deck_slides;
CREATE POLICY "deck_slides_team" ON deck_slides
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "decks_all" ON decks;
CREATE POLICY "decks_team" ON decks
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "discovery_interviews_all" ON discovery_interviews;
CREATE POLICY "discovery_interviews_team" ON discovery_interviews
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "document_chunks_all" ON document_chunks;
CREATE POLICY "document_chunks_team" ON document_chunks
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "Team members can manage document versions" ON document_versions;
CREATE POLICY "document_versions_team" ON document_versions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "Team members can manage documents" ON documents;
CREATE POLICY "documents_team" ON documents
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "economic_indicators_all" ON economic_indicators;
CREATE POLICY "economic_indicators_team" ON economic_indicators
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "ecosystem_changes_all" ON ecosystem_changes;
CREATE POLICY "ecosystem_changes_team" ON ecosystem_changes
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "ecosystem_watches_all" ON ecosystem_watches;
CREATE POLICY "ecosystem_watches_team" ON ecosystem_watches
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "fastmail_accounts_all" ON fastmail_accounts;
CREATE POLICY "fastmail_accounts_team" ON fastmail_accounts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "fastmail_exclusions_all" ON fastmail_exclusions;
CREATE POLICY "fastmail_exclusions_team" ON fastmail_exclusions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "fastmail_sync_state_all" ON fastmail_sync_state;
CREATE POLICY "fastmail_sync_state_team" ON fastmail_sync_state
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "feedback_all" ON feedback;
CREATE POLICY "feedback_team" ON feedback
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "field_source_minimums_all" ON field_source_minimums;
CREATE POLICY "field_source_minimums_team" ON field_source_minimums
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "finding_divergence_pairs_all" ON finding_divergence_pairs;
CREATE POLICY "finding_divergence_pairs_team" ON finding_divergence_pairs
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "finding_metric_config_all" ON finding_metric_config;
CREATE POLICY "finding_metric_config_team" ON finding_metric_config
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "finding_thresholds_all" ON finding_thresholds;
CREATE POLICY "finding_thresholds_team" ON finding_thresholds
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "finding_watch_all" ON finding_watch;
CREATE POLICY "finding_watch_team" ON finding_watch
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "form_submissions_read" ON form_submissions;
CREATE POLICY "form_submissions_team" ON form_submissions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "forms_all" ON forms;
CREATE POLICY "forms_team" ON forms
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "fx_rates_all" ON fx_rates;
CREATE POLICY "fx_rates_team" ON fx_rates
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "holding_bases_all" ON holding_bases;
CREATE POLICY "holding_bases_team" ON holding_bases
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "indicator_observations_all" ON indicator_observations;
CREATE POLICY "indicator_observations_team" ON indicator_observations
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "interactions_all" ON interactions;
CREATE POLICY "interactions_team" ON interactions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "jurisdiction_notes_all" ON jurisdiction_notes;
CREATE POLICY "jurisdiction_notes_team" ON jurisdiction_notes
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "knowledge_connections_all" ON knowledge_connections;
CREATE POLICY "knowledge_connections_team" ON knowledge_connections
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "knowledge_items_all" ON knowledge_items;
CREATE POLICY "knowledge_items_team" ON knowledge_items
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "library_questions_all" ON library_questions;
CREATE POLICY "library_questions_team" ON library_questions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "market_report_feedback_all" ON market_report_feedback;
CREATE POLICY "market_report_feedback_team" ON market_report_feedback
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "market_report_guidelines_all" ON market_report_guidelines;
CREATE POLICY "market_report_guidelines_team" ON market_report_guidelines
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "market_reports_all" ON market_reports;
CREATE POLICY "market_reports_team" ON market_reports
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "model_configs_authenticated_read" ON model_configs;
DROP POLICY IF EXISTS "model_configs_authenticated_write" ON model_configs;
CREATE POLICY "model_configs_team" ON model_configs
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "mvp_template_versions_all" ON mvp_template_versions;
CREATE POLICY "mvp_template_versions_team" ON mvp_template_versions
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "mvp_templates_all" ON mvp_templates;
CREATE POLICY "mvp_templates_team" ON mvp_templates
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "news_items_read" ON news_items;
DROP POLICY IF EXISTS "news_items_write" ON news_items;
CREATE POLICY "news_items_team" ON news_items
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "news_sources_all" ON news_sources;
CREATE POLICY "news_sources_team" ON news_sources
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "newsletter_runs_read" ON newsletter_runs;
DROP POLICY IF EXISTS "newsletter_runs_write" ON newsletter_runs;
CREATE POLICY "newsletter_runs_team" ON newsletter_runs
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "oauth_states_all" ON oauth_states;
CREATE POLICY "oauth_states_team" ON oauth_states
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "onchain_indicators_all" ON onchain_indicators;
CREATE POLICY "onchain_indicators_team" ON onchain_indicators
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "onchain_observations_all" ON onchain_observations;
CREATE POLICY "onchain_observations_team" ON onchain_observations
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "pain_point_log_all" ON pain_point_log;
CREATE POLICY "pain_point_log_team" ON pain_point_log
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "pain_points_all" ON pain_points;
CREATE POLICY "pain_points_team" ON pain_points
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "Team members can read personas" ON personas;
DROP POLICY IF EXISTS "Team members can write personas" ON personas;
CREATE POLICY "personas_team" ON personas
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "platform_capabilities_all" ON platform_capabilities;
CREATE POLICY "platform_capabilities_team" ON platform_capabilities
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "platform_files_all" ON platform_files;
CREATE POLICY "platform_files_team" ON platform_files
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "platform_specs_all" ON platform_specs;
CREATE POLICY "platform_specs_team" ON platform_specs
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "podcast_collection_items_all" ON podcast_collection_items;
CREATE POLICY "podcast_collection_items_team" ON podcast_collection_items
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "podcast_collections_all" ON podcast_collections;
CREATE POLICY "podcast_collections_team" ON podcast_collections
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "podcast_episodes_all" ON podcast_episodes;
CREATE POLICY "podcast_episodes_team" ON podcast_episodes
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "post_metrics_all" ON post_metrics;
CREATE POLICY "post_metrics_team" ON post_metrics
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "product_key_contacts_all" ON product_key_contacts;
CREATE POLICY "product_key_contacts_team" ON product_key_contacts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "product_referral_agreements_all" ON product_referral_agreements;
CREATE POLICY "product_referral_agreements_team" ON product_referral_agreements
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "products_services_all" ON products_services;
CREATE POLICY "products_services_team" ON products_services
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "projects_all" ON projects;
CREATE POLICY "projects_team" ON projects
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_team" ON reminders
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "report_candidates_all" ON report_candidates;
CREATE POLICY "report_candidates_team" ON report_candidates
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "report_segments_all" ON report_segments;
CREATE POLICY "report_segments_team" ON report_segments
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "reports_all" ON reports;
CREATE POLICY "reports_team" ON reports
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "requirements_all" ON requirements;
CREATE POLICY "requirements_team" ON requirements
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "research_classifications_all" ON research_classifications;
CREATE POLICY "research_classifications_team" ON research_classifications
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "research_companies_all" ON research_companies;
CREATE POLICY "research_companies_team" ON research_companies
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "research_company_facts_all" ON research_company_facts;
CREATE POLICY "research_company_facts_team" ON research_company_facts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "research_documents_all" ON research_documents;
CREATE POLICY "research_documents_team" ON research_documents
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "research_findings_all" ON research_findings;
CREATE POLICY "research_findings_team" ON research_findings
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "risk_register_all" ON risk_register;
CREATE POLICY "risk_register_team" ON risk_register
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "routines_all" ON routines;
CREATE POLICY "routines_team" ON routines
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "segment_scorecards_all" ON segment_scorecards;
CREATE POLICY "segment_scorecards_team" ON segment_scorecards
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "social_accounts_all" ON social_accounts;
CREATE POLICY "social_accounts_team" ON social_accounts
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "social_credentials_all" ON social_credentials;
CREATE POLICY "social_credentials_team" ON social_credentials
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "source_classes_all" ON source_classes;
CREATE POLICY "source_classes_team" ON source_classes
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "tasks_all" ON tasks;
CREATE POLICY "tasks_team" ON tasks
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "team_members_all" ON team_members;
CREATE POLICY "team_members_team" ON team_members
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "thread_segments_all" ON thread_segments;
CREATE POLICY "thread_segments_team" ON thread_segments
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "transcript_segments_read" ON transcript_segments;
DROP POLICY IF EXISTS "transcript_segments_write" ON transcript_segments;
CREATE POLICY "transcript_segments_team" ON transcript_segments
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "treasury_events_all" ON treasury_events;
CREATE POLICY "treasury_events_team" ON treasury_events
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "treasury_holdings_snapshots_all" ON treasury_holdings_snapshots;
CREATE POLICY "treasury_holdings_snapshots_team" ON treasury_holdings_snapshots
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "voice_snippets_all" ON voice_snippets;
CREATE POLICY "voice_snippets_team" ON voice_snippets
  FOR ALL USING (is_team_member());

DROP POLICY IF EXISTS "workflow_progress_read" ON workflow_progress;
DROP POLICY IF EXISTS "workflow_progress_write" ON workflow_progress;
CREATE POLICY "workflow_progress_team" ON workflow_progress
  FOR ALL USING (is_team_member());


-- ------------------------------------------------------------
-- Regression guard
-- ------------------------------------------------------------
-- The reason this migration exists is that nobody noticed 114
-- permissive policies accumulating one CREATE TABLE at a time,
-- each one copying the last. Nothing about applying it stops the
-- 115th.
--
-- So the audit becomes a function, and a test calls it. A new
-- table carrying the old pattern turns a test red on the PR that
-- adds it, rather than waiting for someone to think to look.
--
-- Deliberately wider than the query in the spec bundle: it
-- catches USING (true) as well as auth.role(), because that is
-- the class the bundle's own audit missed.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_permissive_policies()
RETURNS TABLE (tablename TEXT, policyname TEXT, cmd TEXT, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    p.tablename::TEXT,
    p.policyname::TEXT,
    p.cmd::TEXT,
    CASE
      WHEN COALESCE(p.qual, '') ILIKE '%auth.role()%'
        OR COALESCE(p.with_check, '') ILIKE '%auth.role()%'
        THEN 'auth.role() grants every authenticated session'
      ELSE 'USING (true) grants every authenticated session'
    END::TEXT
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND (
      COALESCE(p.qual, '') ILIKE '%auth.role()%'
      OR COALESCE(p.with_check, '') ILIKE '%auth.role()%'
      OR (COALESCE(p.qual, '') = 'true' AND p.roles::TEXT LIKE '%authenticated%')
      OR (p.qual IS NULL AND COALESCE(p.with_check, '') = 'true'
          AND p.roles::TEXT LIKE '%authenticated%')
    )
    -- The two deliberate exceptions, named so the guard stays at zero.
    AND NOT (p.tablename = 'form_submissions' AND p.policyname = 'form_submissions_insert')
    AND NOT (p.tablename = 'platform_files' AND p.policyname = 'platform_files_public_select')
  ORDER BY p.tablename, p.policyname;
$$;

REVOKE ALL ON FUNCTION audit_permissive_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_permissive_policies() TO authenticated;

COMMENT ON FUNCTION audit_permissive_policies() IS
  'Every policy granting a table to any authenticated session. Must return zero rows. Wider than the original audit: catches USING (true) as well as auth.role().';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Expect zero rows:
--   SELECT * FROM audit_permissive_policies();
--
-- Expect TRUE as a founder, FALSE as anyone else:
--   SELECT is_team_member();
-- ------------------------------------------------------------
