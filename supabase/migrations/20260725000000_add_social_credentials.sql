-- ============================================================
-- LinkedIn posting: credentials, OAuth state, publish tracking
-- ============================================================
-- Adds social_credentials (one OAuth credential per social_accounts
-- row, LinkedIn-only for now), oauth_states (short-lived CSRF state
-- for the web OAuth callback), and publish-tracking columns on
-- content_items consumed by the socialPublishListener poller.
--
-- Access tokens live in Supabase Vault, NOT in this table: these
-- tokens can post publicly as a founder, so the ciphertext stays in
-- vault.secrets and only access_token_id (the secret's UUID) is
-- stored here. The vault schema is not reachable over PostgREST, so
-- the three SECURITY DEFINER wrappers at the bottom of this file are
-- the only way in or out — and the read wrapper is service_role-only,
-- so the web app can store a token it can never read back.
--
-- Spec: docs/features/linkedin-posting/feature-spec.md
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ── Social credentials ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_credentials (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id    UUID        NOT NULL UNIQUE
                                   REFERENCES social_accounts(id) ON DELETE CASCADE,
  provider             TEXT        NOT NULL DEFAULT 'linkedin'
                                   CHECK (provider IN ('linkedin')),
  -- vault.secrets.id holding the OAuth access token. No FK: vault.secrets is
  -- extension-owned. delete_social_credential() keeps the two in step.
  access_token_id      UUID        NOT NULL,
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
-- callback, which rejects states older than 10 minutes.

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

-- ── Vault wrappers ───────────────────────────────────────────────────────────
-- PostgREST cannot see the vault schema, so these are the only door. Each is
-- SECURITY DEFINER with a pinned search_path.

-- Store (or re-store, on reconnect) a token and upsert its credential row in
-- one call, so the caller never handles the secret id. Callable by the web app:
-- writing a token it cannot read back is safe.
CREATE OR REPLACE FUNCTION public.store_social_credential(
  p_social_account_id UUID,
  p_author_urn        TEXT,
  p_token             TEXT,
  p_expires_at        TIMESTAMPTZ,
  p_scopes            TEXT[] DEFAULT NULL,
  p_connected_by      UUID   DEFAULT NULL,
  p_provider          TEXT   DEFAULT 'linkedin'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  SELECT access_token_id INTO v_secret_id
  FROM social_credentials
  WHERE social_account_id = p_social_account_id;

  IF v_secret_id IS NULL THEN
    v_secret_id := vault.create_secret(
      p_token,
      'social_credential_' || p_social_account_id::TEXT,
      'OAuth access token for social_accounts.id=' || p_social_account_id::TEXT
    );
  ELSE
    -- Reconnect: rotate the ciphertext in place, keeping the same secret id.
    PERFORM vault.update_secret(v_secret_id, p_token);
  END IF;

  INSERT INTO social_credentials (
    social_account_id, provider, access_token_id, author_urn,
    scopes, expires_at, connected_by,
    last_error, last_error_at, consecutive_failures
  ) VALUES (
    p_social_account_id, p_provider, v_secret_id, p_author_urn,
    p_scopes, p_expires_at, p_connected_by,
    NULL, NULL, 0
  )
  ON CONFLICT (social_account_id) DO UPDATE SET
    provider             = EXCLUDED.provider,
    access_token_id      = EXCLUDED.access_token_id,
    author_urn           = EXCLUDED.author_urn,
    scopes               = EXCLUDED.scopes,
    expires_at           = EXCLUDED.expires_at,
    connected_by         = EXCLUDED.connected_by,
    last_error           = NULL,
    last_error_at        = NULL,
    consecutive_failures = 0;
END;
$$;

-- Decrypt a stored token. service_role ONLY (the agents publish poller):
-- granting this to authenticated would put the token back within reach of any
-- signed-in session and undo the point of using Vault.
CREATE OR REPLACE FUNCTION public.social_credential_token(p_social_account_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
  SELECT s.decrypted_secret
  FROM social_credentials c
  JOIN vault.decrypted_secrets s ON s.id = c.access_token_id
  WHERE c.social_account_id = p_social_account_id;
$$;

-- Disconnect: drop the credential row and its ciphertext together.
CREATE OR REPLACE FUNCTION public.delete_social_credential(p_social_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  SELECT access_token_id INTO v_secret_id
  FROM social_credentials
  WHERE social_account_id = p_social_account_id;

  DELETE FROM social_credentials WHERE social_account_id = p_social_account_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

-- Functions default to EXECUTE for PUBLIC — revoke first, then grant narrowly.
REVOKE ALL ON FUNCTION public.store_social_credential(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT[], UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_credential_token(UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_social_credential(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.store_social_credential(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT[], UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_social_credential(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_credential_token(UUID) TO service_role;
