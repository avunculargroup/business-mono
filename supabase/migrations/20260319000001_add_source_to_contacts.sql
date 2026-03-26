-- ============================================================
-- Add source column to contacts table
-- ============================================================
-- Supersedes: packages/db/migrations/001_add_source_to_contacts.sql
--
-- Written idempotently (ADD COLUMN IF NOT EXISTS) because this column
-- is already present in the baseline migration 20260319000000.
-- This migration preserves the historical record of when it was
-- introduced as a discrete change.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript'));
