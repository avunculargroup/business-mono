-- ============================================================
-- LinkedIn posting: credentials, OAuth state, publish tracking
-- ============================================================
-- Adds social_credentials (one OAuth credential per social_accounts
-- row, LinkedIn-only for now), oauth_states (short-lived CSRF state
-- for the web OAuth callback), and publish-tracking columns on
-- content_items consumed by the socialPublishListener poller.
-- Spec: docs/features/linkedin-posting/feature-spec.md
-- ============================================================

-- ── Social credentials ───────────────────────────────────────────────────────
-- Kept separate from social_accounts so token columns are never selected
-- by existing UI queries. Tokens are LinkedIn OAuth access tokens
-- (60-day lifetime, never exposed in the UI).

CREATE TABLE IF NOT EXISTS social_credentials (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id    UUID        NOT NULL UNIQUE
                                   REFERENCES social_accounts(id) ON DELETE CASCADE,
  provider             TEXT        NOT NULL DEFAULT 'linkedin'
                                   CHECK (provider IN ('linkedin')),
  access_token         TEXT        NOT NULL,
  author_urn           TEXT        NOT NULL,   -- urn:li:person:… or urn:li:organization:…
  scopes               TEXT[],
  expires_at           TIMESTAMPTZ NOT NULL,
  connected_by         UUID        REFERENCES team_members(id),
  last_error           TEXT,
  last_error_at        TIMESTAMPTZ,
  consecutive_failures INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER social_credentials_updated_at
  BEFORE UPDATE ON social_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_credentials_all" ON social_credentials;
CREATE POLICY "social_credentials_all" ON social_credentials
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── OAuth CSRF state ─────────────────────────────────────────────────────────
-- Written by /api/integrations/linkedin/start, consumed (deleted) by the
-- callback. Rows are short-lived; the callback rejects states older than
-- 10 minutes.

CREATE TABLE IF NOT EXISTS oauth_states (
  state             TEXT        PRIMARY KEY,
  social_account_id UUID        NOT NULL
                                REFERENCES social_accounts(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oauth_states_all" ON oauth_states;
CREATE POLICY "oauth_states_all" ON oauth_states
  FOR ALL
  USING  (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ── Publish tracking on content_items ────────────────────────────────────────
-- publish_locked_at is the atomic claim marker: the poller only posts after
-- flipping it from NULL, so overlapping ticks can never double-post.

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS publish_error     TEXT;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS publish_attempts  INT NOT NULL DEFAULT 0;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS publish_locked_at TIMESTAMPTZ;

-- Poller scan: due scheduled items not yet claimed.
CREATE INDEX IF NOT EXISTS idx_content_scheduled_due
  ON content_items (scheduled_for)
  WHERE status = 'scheduled' AND publish_locked_at IS NULL;
