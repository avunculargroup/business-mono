-- ============================================================
-- Add source column to companies table
-- ============================================================
-- The web UI (apps/web/app/actions/companies.ts) inserts
-- source: 'web' when creating a company, but the column did
-- not exist, causing "Could not find the 'source' column of
-- 'companies' in the schema cache" errors.
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'web', 'coordinator_agent', 'recorder_agent', 'call_transcript'));
