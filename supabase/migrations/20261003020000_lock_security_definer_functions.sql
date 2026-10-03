-- ============================================================
-- SECURITY — security-definer functions anon could call
-- Supabase advisor 0028/0029 (anon/authenticated can execute a SECURITY
-- DEFINER function).
--
-- 20260725000000 meant to restrict the three vault wrappers, and
-- 20260910000000 meant to restrict audit_permissive_policies. Both did it by
-- REVOKE … FROM PUBLIC and a narrow GRANT. That does not work on Supabase:
-- its default privileges grant EXECUTE on every new function in `public`
-- directly to anon, authenticated and service_role, not through PUBLIC, so
-- revoking PUBLIC leaves those grants in place. On live, anon held EXECUTE on
-- all four. With the anon key from the browser bundle, anyone could:
--   - social_credential_token(id)   read a decrypted LinkedIn OAuth token;
--   - store_social_credential(…)    replace one with a token of their own;
--   - delete_social_credential(id)  delete one.
-- No token was stored when this was found (social_credentials was empty), so
-- nothing was readable. But the account ids sat in v_campaign_matrix, which
-- anon could read until 20261003010000.
--
-- Fixed by revoking from the roles themselves, and — because `authenticated`
-- includes Minute subscribers — by adding a team-member check inside the two
-- wrappers the web app calls. packages/db/src/migrations.test.ts now fails on
-- any SECURITY DEFINER function that is never revoked from anon.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Decrypting a token: service_role only, as 20260725000000 intended
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.social_credential_token(UUID) FROM anon, authenticated;


-- ------------------------------------------------------------
-- 2. Storing and deleting: team members (and the service role) only
--
-- 20260725000000's bodies, unchanged except for the check at the top. The web
-- app calls both with a team member's session; a Minute subscriber's session
-- is also `authenticated`, so the role grant alone cannot tell them apart.
-- ------------------------------------------------------------

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
  IF NOT (is_team_member() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Only a team member can store a social credential'
      USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.delete_social_credential(p_social_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  IF NOT (is_team_member() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Only a team member can delete a social credential'
      USING ERRCODE = '42501';
  END IF;

  SELECT access_token_id INTO v_secret_id
  FROM social_credentials
  WHERE social_account_id = p_social_account_id;

  DELETE FROM social_credentials WHERE social_account_id = p_social_account_id;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.store_social_credential(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT[], UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_social_credential(UUID) FROM anon;


-- ------------------------------------------------------------
-- 3. The policy audit: authenticated only, as 20260910000000 intended
--
-- It lists every policy that grants too much. That is a map for an attacker,
-- and nothing unauthenticated needs it.
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.audit_permissive_policies() FROM anon;


-- ------------------------------------------------------------
-- Left callable by anon, deliberately:
--   is_team_member(), current_client_account_id() — RLS policies call them,
--     and a policy runs as the querying role. Revoking them from anon turns
--     an empty result into a permission error on every anon read. Both read
--     auth.uid(), which is NULL for anon, so they answer false / NULL.
--   client_invite_details(token) — the invite page reads it before sign-in.
--     It returns nothing without a valid, unexpired invitation token.
--   redeem_client_invite(token) — refuses any call without a signed-in
--     session.
--   assert_not_client_user(), assert_not_team_member() — trigger functions.
--     Called over RPC they fail, because they have no NEW row.
-- ------------------------------------------------------------
