-- ============================================================
-- INVITE REDEMPTION
-- ============================================================
-- Depends on: 20260911020000_client_tables.sql
--
-- Accepting an invitation has to insert a client_users row, and no
-- subscriber may hold an INSERT policy on that table — a seat that
-- can create seats is not a seat. The obvious way out is a
-- service-role key in apps/client, and that is the wrong way out:
-- the service role bypasses RLS entirely, so one key in one server
-- action would make every policy in the hardening migration
-- decorative.
--
-- So the privilege lives here instead, in a SECURITY DEFINER
-- function with exactly one job, whose whole body is readable in
-- a migration diff. apps/client keeps the anon key and can do
-- precisely this one privileged thing, on presentation of a token
-- it was sent.
-- ============================================================

CREATE OR REPLACE FUNCTION redeem_client_invite(invite_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  invite   client_invites%ROWTYPE;
  claimant UUID := auth.uid();
  claimant_email TEXT;
BEGIN
  IF claimant IS NULL THEN
    RAISE EXCEPTION 'An invitation can only be redeemed by a signed-in session';
  END IF;

  -- Looked up by hash. The token is never stored, so a founder with
  -- read access to this table still cannot use anyone's invitation.
  SELECT * INTO invite
  FROM client_invites
  WHERE token_hash = encode(digest(invite_token, 'sha256'), 'hex');

  -- One message for every failure mode: wrong token, expired,
  -- revoked, already used. Distinguishing them would turn this
  -- function into an oracle for guessing valid tokens.
  IF invite.id IS NULL
     OR invite.revoked_at IS NOT NULL
     OR invite.accepted_at IS NOT NULL
     OR invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'This invitation is not valid';
  END IF;

  -- The invitation is to an address, not to whoever holds the link.
  -- Without this, a forwarded link would seat the wrong person.
  SELECT email INTO claimant_email FROM auth.users WHERE id = claimant;

  IF lower(claimant_email) IS DISTINCT FROM lower(invite.email) THEN
    RAISE EXCEPTION 'This invitation was issued to a different address';
  END IF;

  -- The disjointness trigger on client_users fires here if the
  -- claimant is a team member, which is the intended outcome.
  INSERT INTO client_users (id, account_id, full_name, email, role, status)
  VALUES (claimant, invite.account_id, invite.full_name, invite.email, invite.role, 'active')
  ON CONFLICT (id) DO NOTHING;

  UPDATE client_invites
  SET accepted_at = NOW(), accepted_by = claimant
  WHERE id = invite.id;

  RETURN invite.account_id;
END;
$$;

REVOKE ALL ON FUNCTION redeem_client_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_client_invite(TEXT) TO authenticated;

COMMENT ON FUNCTION redeem_client_invite(TEXT) IS
  'Redeems a single-use, time-limited invitation for the calling session. SECURITY DEFINER so apps/client never needs a service-role key.';


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- As an authenticated non-team session with a valid, unexpired,
-- unredeemed invitation issued to its own address:
--   SELECT redeem_client_invite('<token>');   -- returns account_id
--   SELECT redeem_client_invite('<token>');   -- raises: already accepted
--
-- With any wrong token, and with a token issued to another
-- address, the message is the same. That is deliberate.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- Reading an invitation before redeeming it
-- ------------------------------------------------------------
-- The invite page has to render something before anyone is signed
-- in, and client_invites is team-only by policy. Same problem as
-- redemption and the same answer: a SECURITY DEFINER function with
-- one job, rather than a key that can do everything.
--
-- It returns the address the invitation was issued to. That is not
-- a leak: whoever holds the token was sent it at that address, and
-- showing it is what lets them notice a forwarded link is not
-- theirs. It returns nothing at all for a token that is expired,
-- revoked or already used, so the page can say so without the
-- function having to explain which.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION client_invite_details(invite_token TEXT)
RETURNS TABLE (email TEXT, full_name TEXT, account_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT i.email, i.full_name, a.display_name
  FROM client_invites i
  JOIN client_accounts a ON a.id = i.account_id
  WHERE i.token_hash = encode(digest(invite_token, 'sha256'), 'hex')
    AND i.revoked_at IS NULL
    AND i.accepted_at IS NULL
    AND i.expires_at >= NOW();
$$;

REVOKE ALL ON FUNCTION client_invite_details(TEXT) FROM PUBLIC;
-- anon as well as authenticated: the invite page is reached before
-- there is a session, which is the entire point of it.
GRANT EXECUTE ON FUNCTION client_invite_details(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION client_invite_details(TEXT) IS
  'Details of a live invitation, by token. Returns no rows for an expired, revoked or redeemed one, so the caller cannot tell which.';
