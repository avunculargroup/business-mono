-- ============================================================
-- PRODUCTS & SERVICES + ADVISORS & PARTNERS
-- Migration: 20260427000000_add_products_and_advisors
-- ============================================================


-- ============================================================
-- PRODUCTS / SERVICES
-- ============================================================

CREATE TABLE IF NOT EXISTS products_services (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  company_id           UUID        REFERENCES companies(id) ON DELETE SET NULL,
  business_name        TEXT,
  australian_owned     BOOLEAN     NOT NULL DEFAULT FALSE,
  category             TEXT        CHECK (category IN (
                         'custody', 'exchange', 'wallet_software', 'wallet_hardware',
                         'payment_processing', 'treasury_management', 'education',
                         'consulting', 'insurance', 'lending', 'other'
                       )),
  description          TEXT,
  logo_url             TEXT,
  product_image_url    TEXT,
  key_relationship_id  UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_by           UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER products_services_updated_at
  BEFORE UPDATE ON products_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ps_company   ON products_services(company_id);
CREATE INDEX IF NOT EXISTS idx_ps_category  ON products_services(category);
CREATE INDEX IF NOT EXISTS idx_ps_key_rel   ON products_services(key_relationship_id);

ALTER TABLE products_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_services_all" ON products_services;
CREATE POLICY "products_services_all" ON products_services
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PRODUCT REFERRAL AGREEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS product_referral_agreements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id UUID        NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  agreement_type     TEXT        CHECK (agreement_type IN (
                       'referral_fee', 'revenue_share', 'affiliate', 'strategic', 'other'
                     )),
  counterparty_name  TEXT,
  fee_structure      TEXT,
  percentage         NUMERIC(5,2),
  active             BOOLEAN     NOT NULL DEFAULT TRUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER product_referral_agreements_updated_at
  BEFORE UPDATE ON product_referral_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_pra_product ON product_referral_agreements(product_service_id);

ALTER TABLE product_referral_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_referral_agreements_all" ON product_referral_agreements;
CREATE POLICY "product_referral_agreements_all" ON product_referral_agreements
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- PRODUCT KEY CONTACTS (junction)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_key_contacts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id UUID        NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  contact_id         UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role               TEXT        CHECK (role IN ('primary', 'technical', 'sales', 'support', 'other')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_service_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_pkc_product ON product_key_contacts(product_service_id);
CREATE INDEX IF NOT EXISTS idx_pkc_contact ON product_key_contacts(contact_id);

ALTER TABLE product_key_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_key_contacts_all" ON product_key_contacts;
CREATE POLICY "product_key_contacts_all" ON product_key_contacts
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- ADVISORS & PARTNERS
-- ============================================================

CREATE TABLE IF NOT EXISTS advisors_partners (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('advisor', 'partner')),
  company_id          UUID        REFERENCES companies(id) ON DELETE SET NULL,
  specialization      TEXT,
  engagement_model    TEXT        CHECK (engagement_model IN (
                        'ongoing_retainer', 'project_based', 'ad_hoc',
                        'revenue_share', 'honorary'
                      )),
  rate_notes          TEXT,
  bio                 TEXT,
  logo_url            TEXT,
  website             TEXT,
  linkedin_url        TEXT,
  key_relationship_id UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by          UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER advisors_partners_updated_at
  BEFORE UPDATE ON advisors_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ap_type    ON advisors_partners(type);
CREATE INDEX IF NOT EXISTS idx_ap_active  ON advisors_partners(active);
CREATE INDEX IF NOT EXISTS idx_ap_company ON advisors_partners(company_id);
CREATE INDEX IF NOT EXISTS idx_ap_key_rel ON advisors_partners(key_relationship_id);

ALTER TABLE advisors_partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advisors_partners_all" ON advisors_partners;
CREATE POLICY "advisors_partners_all" ON advisors_partners
  FOR ALL USING (auth.role() = 'authenticated');


-- ============================================================
-- ADVISOR / PARTNER KEY CONTACTS (junction)
-- ============================================================

CREATE TABLE IF NOT EXISTS advisor_partner_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_partner_id  UUID        NOT NULL REFERENCES advisors_partners(id) ON DELETE CASCADE,
  contact_id          UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (advisor_partner_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_apc_advisor ON advisor_partner_contacts(advisor_partner_id);
CREATE INDEX IF NOT EXISTS idx_apc_contact ON advisor_partner_contacts(contact_id);

ALTER TABLE advisor_partner_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advisor_partner_contacts_all" ON advisor_partner_contacts;
CREATE POLICY "advisor_partner_contacts_all" ON advisor_partner_contacts
  FOR ALL USING (auth.role() = 'authenticated');
