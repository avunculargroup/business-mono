-- ============================================================
-- SECURITY — every view runs as the caller
-- Supabase advisor 0010_security_definer_view (ERROR), 33 findings.
--
-- A Postgres view runs with its owner's privileges unless it is created with
-- security_invoker. Every view here was owned by the migration role, so it
-- read its tables past RLS — and `anon` and `authenticated` both hold SELECT
-- on them through Supabase's default grants. The anon key is a
-- NEXT_PUBLIC_ variable shipped in both apps' browser bundles. Measured on
-- live on 2 October 2026, with no session at all, /rest/v1/ returned 533 rows
-- of v_recent_interactions, 25 of v_contacts_overview, the whole research
-- ledger, and the rest of the 33. A Minute subscriber saw the same.
--
-- With security_invoker each view applies the RLS policies of whoever is
-- reading. Measured the same way before this shipped, inside a rolled-back
-- transaction:
--   team member  — identical row counts on all 33 views;
--   anon         — zero rows on every view;
--   subscriber   — only what the client policies already admit: the
--                  indicator and onchain series, their own subscription, and
--                  the client-readable rows behind the two review queues.
-- Nothing in apps/client reads a view, and apps/agents uses the service
-- role, which bypasses RLS whichever way a view is defined.
--
-- CREATE OR REPLACE VIEW resets a view's options, so a later migration that
-- redefines one of these silently undoes this. Write new and redefined views
-- WITH (security_invoker = true). packages/db/src/migrations.test.ts replays
-- every migration and fails if any view ends without it.
-- ============================================================

ALTER VIEW IF EXISTS public.v_active_capabilities SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_btc_mvrv SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_btc_trend SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_btc_trend_metrics SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_campaign_matrix SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_campaign_overview SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_client_library_reviews SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_client_subscriptions SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_company_facts SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_company_position SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_contacts_overview SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_ecosystem_feed SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_ecosystem_watch_health SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_episode_library SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_episodes_awaiting_action SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_etf_flow_streak SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_hash_ribbons SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_indicator_latest SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_indicator_series SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_onchain_dashboard SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_onchain_series SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_open_tasks SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_podcast_ingestion_status SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_prepare_template_reviews SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_ready_to_post SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_recent_interactions SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_recent_reports SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_report_watch_health SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_research_absences SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_research_freshness SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_research_ledger SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_research_publishable SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_unresolved_capacity_gaps SET (security_invoker = true);
