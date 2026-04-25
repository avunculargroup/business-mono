-- ──────────────────────────────────────────────────────────────
-- COMPANY DOMAINS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE company_domains (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  provider     TEXT,
  renewal_date DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX company_domains_renewal_date_idx ON company_domains(renewal_date);

CREATE TRIGGER company_domains_updated_at
  BEFORE UPDATE ON company_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE company_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_domains_all" ON company_domains
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- COMPANY SUBSCRIPTIONS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE company_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business      TEXT        NOT NULL,
  website       TEXT,
  service_type  TEXT,
  payment_type  TEXT        CHECK (payment_type IN ('free', 'paid', 'trial')),
  expiry        DATE,
  account_email TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX company_subscriptions_expiry_idx ON company_subscriptions(expiry);

CREATE TRIGGER company_subscriptions_updated_at
  BEFORE UPDATE ON company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_subscriptions_all" ON company_subscriptions
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
