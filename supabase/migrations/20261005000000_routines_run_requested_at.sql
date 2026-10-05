-- ── routines.run_requested_at: "Run now" for a routine that is switched off ──
-- "Run now" used to set next_run_at to now, but the scheduler only selects
-- active routines, so a switched-off routine never ran and the page still said
-- it was queued. A request is now its own column: the scheduler runs any
-- routine with one, active or not, and clears it when it claims the run.
-- The routine's schedule (next_run_at, is_active) is left as it was.

ALTER TABLE routines ADD COLUMN IF NOT EXISTS run_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN routines.run_requested_at IS
  'Set by "Run now". The scheduler runs the routine once, active or not, and clears this when it claims the run.';
