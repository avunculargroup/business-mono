-- ============================================================
-- Fastmail JMAP email auto-logging
-- ============================================================
-- Adds three new tables for DB-managed Fastmail accounts,
-- exclusion rules, and per-account sync state. Also extends
-- the source CHECK constraints on contacts and interactions
-- to accept 'fastmail_sync' as a valid source value.
-- ============================================================

-- ── Extend source check constraints ──────────────────────────────────────────

-- contacts.source inline CHECK is auto-named contacts_source_check
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN (
    'manual', 'coordinator_agent', 'recorder_agent',
    'signal', 'call_transcript', 'fastmail_sync'
  ));

-- interactions.source inline CHECK is auto-named interactions_source_check
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_source_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_source_check
  CHECK (source IN (
    'manual', 'coordinator_agent', 'recorder_agent',
    'signal', 'call_transcript', 'fastmail_sync'
  ));

-- ── Fastmail accounts ─────────────────────────────────────────────────────────
-- One row per team member Fastmail account to monitor.
-- Tokens are Fastmail app-specific passwords (never exposed in the UI).

CREATE TABLE IF NOT EXISTS fastmail_accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT        NOT NULL UNIQUE,   -- e.g. simon@fastmail.com
  token        TEXT        NOT NULL,          -- Fastmail app-specific password
  display_name TEXT,                          -- optional label, e.g. "Simon"
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER fastmail_accounts_updated_at
  BEFORE UPDATE ON fastmail_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fastmail_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_accounts_all" ON fastmail_accounts;
CREATE POLICY "fastmail_accounts_all" ON fastmail_accounts
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Exclusions ────────────────────────────────────────────────────────────────
-- Emails where any participant matches an exclusion rule are silently skipped.
-- type='domain' matches the domain part of any participant's email address.
-- type='email' matches a full email address exactly (case-insensitive at lookup).

CREATE TABLE IF NOT EXISTS fastmail_exclusions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL CHECK (type IN ('domain', 'email')),
  value      TEXT        NOT NULL UNIQUE,     -- e.g. 'stripe.com' or 'noreply@example.com'
  notes      TEXT,                            -- optional human-readable reason
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fastmail_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_exclusions_all" ON fastmail_exclusions;
CREATE POLICY "fastmail_exclusions_all" ON fastmail_exclusions
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Sync state ────────────────────────────────────────────────────────────────
-- One row per fastmail_accounts row.
-- Stores JMAP queryState values for Inbox and Sent to enable incremental sync.
-- jmap_account_id is Fastmail's internal JMAP accountId, populated on first sync.

CREATE TABLE IF NOT EXISTS fastmail_sync_state (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID        NOT NULL UNIQUE
                    REFERENCES fastmail_accounts(id) ON DELETE CASCADE,
  jmap_account_id   TEXT,
  inbox_query_state TEXT,
  sent_query_state  TEXT,
  last_synced_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER fastmail_sync_state_updated_at
  BEFORE UPDATE ON fastmail_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fastmail_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastmail_sync_state_all" ON fastmail_sync_state;
CREATE POLICY "fastmail_sync_state_all" ON fastmail_sync_state
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Platform capability registration ─────────────────────────────────────────

INSERT INTO platform_capabilities (agent_name, capability, status, notes)
SELECT 'simon', 'fastmail_email_sync', 'active',
       'Automatic email logging from Fastmail accounts via JMAP polling. Della analyses content for action items, decisions, and bitcoin signals.'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_capabilities
  WHERE agent_name = 'simon' AND capability = 'fastmail_email_sync'
);
