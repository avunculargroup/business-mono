-- Track auth/poll failures on Fastmail accounts so the listener can auto-disable
-- accounts whose tokens have expired and surface the failure in the integrations UI.

ALTER TABLE fastmail_accounts
  ADD COLUMN IF NOT EXISTS last_error           TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
