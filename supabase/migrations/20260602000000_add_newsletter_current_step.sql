-- Fine-grained progress for the /content newsletter widget. `status` only tracks
-- coarse lifecycle states, so the long stretches between gates (retrieval,
-- research, drafting, editing, assembly) all read as a flat 'running'. current_step
-- records which workflow step is executing so the web stepper can show live
-- movement. Written best-effort at the top of each step; never gates the run.
-- The table is already in the supabase_realtime publication (see
-- 20260531000001_add_newsletter_runs), so the new column streams through too.

ALTER TABLE newsletter_runs
  ADD COLUMN IF NOT EXISTS current_step TEXT;
