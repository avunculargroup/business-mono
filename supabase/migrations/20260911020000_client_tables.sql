-- ============================================================
-- CLIENT ACCOUNTS
-- apps/client — Minute, invite-only paid subscription app
-- ============================================================
-- Depends on: 20260911010000_compliance_documents.sql
--
-- Note what is absent from client_accounts: any column capable of
-- holding a subscriber's financial position. No fund balance, no
-- member details, no risk profile, no holdings, no entity
-- financials.
--
-- Personal circumstances are the ingredient that turns information
-- into advice. That absence is not enforced by UI copy or by anyone
-- remembering a rule; it is enforced by there being nowhere to put
-- the data, which makes "we have no facility for you to tell us" a
-- true statement about the schema rather than a promise about
-- behaviour.
--
-- BTS does not give financial advice and holds no AFS
-- authorisation, so there is no retail/wholesale classification
-- here either: that distinction only does work inside a regime this
-- service is not in, and a column recording it would imply
-- otherwise.
-- ============================================================


-- ------------------------------------------------------------
-- client_accounts
-- ------------------------------------------------------------

CREATE TABLE client_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name            TEXT NOT NULL,

  client_type             TEXT NOT NULL
                          CHECK (client_type IN ('corporate', 'smsf')),

  subscription_status     TEXT NOT NULL DEFAULT 'invited'
                          CHECK (subscription_status IN
                            ('invited', 'active', 'paused', 'lapsed', 'cancelled')),
  subscription_started_at DATE,
  subscription_renews_at  DATE,

  related_company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,

  notes                   TEXT,   -- internal only, never rendered in apps/client

  created_by              UUID REFERENCES team_members(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER client_accounts_updated_at
  BEFORE UPDATE ON client_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_client_accounts_status ON client_accounts(subscription_status);
CREATE INDEX idx_client_accounts_renews ON client_accounts(subscription_renews_at);

COMMENT ON TABLE client_accounts IS
  'Subscribing organisation or fund. Deliberately holds no financial position data: BTS does not give financial advice, and a service that cannot receive personal circumstances cannot give it.';


-- ------------------------------------------------------------
-- client_users
-- ------------------------------------------------------------

CREATE TABLE client_users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,

  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('primary', 'member')),

  status        TEXT NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'active', 'disabled')),

  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER client_users_updated_at
  BEFORE UPDATE ON client_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_client_users_account ON client_users(account_id);


-- ------------------------------------------------------------
-- Disjointness — a person is staff or a subscriber, never both
-- ------------------------------------------------------------
-- Cannot be a CHECK constraint; it spans two tables. A trigger on
-- both sides is the honest way to do it.
--
-- If this ever fires in production it means a founder was invited
-- as a subscriber, which would give them a client session with
-- is_team_member() false and produce a very confusing support
-- ticket.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_not_team_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM team_members WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'User % is a team member and cannot also be a client user', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_users_not_team_member
  BEFORE INSERT OR UPDATE ON client_users
  FOR EACH ROW EXECUTE FUNCTION assert_not_team_member();

CREATE OR REPLACE FUNCTION assert_not_client_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM client_users WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'User % is a client user and cannot also be a team member', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_members_not_client_user
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION assert_not_client_user();


-- ------------------------------------------------------------
-- Account resolution helper
-- ------------------------------------------------------------
-- Same recursion problem as is_team_member(). The client_users
-- policy needs to know the caller's account_id, which means
-- querying client_users, which evaluates the policy. SECURITY
-- DEFINER breaks the loop.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_client_account_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id
  FROM client_users
  WHERE id = auth.uid() AND status = 'active';
$$;

REVOKE ALL ON FUNCTION current_client_account_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_client_account_id() TO authenticated;

COMMENT ON FUNCTION current_client_account_id() IS
  'Account id for the current subscriber session, NULL for staff or disabled users. Filters on status so a disabled user loses access immediately.';


-- ------------------------------------------------------------
-- client_disclosures — the Service Statement gate's audit trail
-- ------------------------------------------------------------

CREATE TABLE client_disclosures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id   UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  document_id      UUID REFERENCES compliance_documents(id),  -- the Service Statement
  document_version TEXT NOT NULL,        -- denormalised; versions get superseded
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       TEXT
);

CREATE INDEX idx_client_disclosures_user ON client_disclosures(client_user_id);
CREATE UNIQUE INDEX idx_client_disclosures_user_version
  ON client_disclosures(client_user_id, document_version);


-- ------------------------------------------------------------
-- client_invites
-- ------------------------------------------------------------
-- Not in the spec bundle's data model, which describes the invite
-- flow in the session plan and gives it nowhere to store a token.
--
-- Single-use and time-limited, per session 2. The token is stored
-- as a SHA-256 hash, not in the clear: this table is readable by
-- every founder and by anything holding the service role key, and
-- a readable invite token is a readable account.
--
-- No RLS policy for subscribers at all. Redemption happens
-- server-side against a token the caller already holds, so a
-- subscriber never needs to select from here — and being able to
-- would let one enumerate pending invites.
-- ------------------------------------------------------------

CREATE TABLE client_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

  email        TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('primary', 'member')),

  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,

  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ,

  created_by   UUID REFERENCES team_members(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_invites_account ON client_invites(account_id);

COMMENT ON COLUMN client_invites.token_hash IS
  'SHA-256 of the invite token. The token itself is never stored — a readable invite token is a readable account.';


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE client_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_disclosures ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invites     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_accounts_team" ON client_accounts
  FOR ALL USING (is_team_member());

CREATE POLICY "client_accounts_self" ON client_accounts
  FOR SELECT USING (id = current_client_account_id());

CREATE POLICY "client_users_team" ON client_users
  FOR ALL USING (is_team_member());

CREATE POLICY "client_users_self" ON client_users
  FOR SELECT USING (account_id = current_client_account_id());

CREATE POLICY "client_disclosures_team" ON client_disclosures
  FOR ALL USING (is_team_member());

CREATE POLICY "client_disclosures_own_read" ON client_disclosures
  FOR SELECT USING (client_user_id = auth.uid());

-- The acknowledgement itself. One of only two writes a subscriber
-- can perform anywhere in the system.
CREATE POLICY "client_disclosures_own_insert" ON client_disclosures
  FOR INSERT WITH CHECK (client_user_id = auth.uid());

CREATE POLICY "client_invites_team" ON client_invites
  FOR ALL USING (is_team_member());


-- ------------------------------------------------------------
-- Client read policies for the two compliance tables
-- ------------------------------------------------------------
-- Deferred from the previous migration because they need
-- current_client_account_id(), which is defined above.
--
-- Active documents only. A subscriber acknowledging a superseded
-- Service Statement would satisfy the gate against the wrong one.
-- ------------------------------------------------------------

CREATE POLICY "compliance_documents_client_read" ON compliance_documents
  FOR SELECT USING (
    current_client_account_id() IS NOT NULL
    AND status = 'active'
  );

CREATE POLICY "company_profile_client_read" ON company_profile
  FOR SELECT USING (current_client_account_id() IS NOT NULL);


-- ------------------------------------------------------------
-- View for Simon's existing expiry monitoring
-- ------------------------------------------------------------

CREATE VIEW v_client_subscriptions AS
  SELECT
    a.id,
    a.display_name,
    a.client_type,
    a.subscription_status,
    a.subscription_renews_at,
    (a.subscription_renews_at - CURRENT_DATE) AS days_until_renewal,
    COUNT(u.id) FILTER (WHERE u.status = 'active') AS active_seats,
    MAX(u.last_seen_at) AS last_seen_at
  FROM client_accounts a
  LEFT JOIN client_users u ON u.account_id = a.id
  WHERE a.subscription_status NOT IN ('cancelled')
  GROUP BY a.id
  ORDER BY a.subscription_renews_at ASC NULLS LAST;

-- last_seen_at is the churn signal worth watching. An account that
-- has not opened the app in six weeks will not renew, and knowing
-- that six weeks out is worth more than knowing it on the renewal
-- date.


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- As a subscriber session, all four should return zero rows:
--   SELECT count(*) FROM contacts;
--   SELECT count(*) FROM agent_activity;
--   SELECT count(*) FROM interactions;
--   SELECT count(*) FROM research_companies;
--
-- And this should return exactly one row, their own:
--   SELECT count(*) FROM client_accounts;
--
-- If any of the first four returns rows, stop and fix the
-- hardening migration.
--
-- Disjointness, as a founder — should raise:
--   INSERT INTO client_users (id, account_id, full_name, email)
--   VALUES ('<a team_members.id>', '<an account>', 'x', 'x@y.z');
-- ------------------------------------------------------------
