-- Add source column to contacts table
-- Matches the pattern used by interactions, tasks, and other tables.

ALTER TABLE contacts
  ADD COLUMN source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'coordinator_agent', 'recorder_agent', 'signal', 'call_transcript'));
