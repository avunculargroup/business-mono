-- A newsletter run can now end in 'no_stories': retrieval + selection produced
-- no candidates worth running, so the workflow bails before the approval gate
-- (there is nothing to approve) and records a diagnostic reason in notes /
-- gate_message. Widen the status CHECK to allow this terminal state.

ALTER TABLE newsletter_runs DROP CONSTRAINT IF EXISTS newsletter_runs_status_check;

ALTER TABLE newsletter_runs ADD CONSTRAINT newsletter_runs_status_check
  CHECK (status IN ('running', 'suspended_gate1', 'suspended_gate2', 'suspended_hold',
                    'completed', 'failed', 'cancelled', 'no_stories'));
