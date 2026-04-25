-- ──────────────────────────────────────────────────────────
-- COMPANY RECORD TYPES (catalogue)
-- ──────────────────────────────────────────────────────────

CREATE TABLE company_record_types (
  key           TEXT        PRIMARY KEY,
  label         TEXT        NOT NULL,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('text', 'markdown', 'image', 'file')),
  category      TEXT        NOT NULL,
  is_singleton  BOOLEAN     NOT NULL DEFAULT false,
  is_builtin    BOOLEAN     NOT NULL DEFAULT false,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed built-in types
INSERT INTO company_record_types (key, label, content_type, category, is_singleton, is_builtin, sort_order) VALUES
  ('legal_name',   'Legal Name',                   'text',     'Legal',      true,  true, 10),
  ('abn',          'ABN',                          'text',     'Legal',      false, true, 20),
  ('acn',          'ACN',                          'text',     'Legal',      false, true, 30),
  ('trading_name', 'Trading Name',                 'text',     'Legal',      false, true, 40),
  ('logo',         'Logo',                         'image',    'Identity',   true,  true, 10),
  ('tagline',      'Tagline',                      'text',     'Identity',   true,  true, 20),
  ('website',      'Website',                      'text',     'Identity',   true,  true, 30),
  ('mission',      'Mission',                      'markdown', 'Content',    true,  true, 10),
  ('vision',       'Vision',                       'markdown', 'Content',    true,  true, 20),
  ('values',       'Values',                       'markdown', 'Content',    true,  true, 30),
  ('about',        'About',                        'markdown', 'Content',    true,  true, 40),
  ('cert_incorp',  'Certificate of Incorporation', 'file',     'Documents',  true,  true, 10);

-- ──────────────────────────────────────────────────────────
-- COMPANY RECORDS (data)
-- ──────────────────────────────────────────────────────────

CREATE TABLE company_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key      TEXT        NOT NULL REFERENCES company_record_types(key) ON DELETE RESTRICT,
  value         TEXT,
  storage_path  TEXT,
  filename      TEXT,
  mime_type     TEXT,
  is_pinned     BOOLEAN     NOT NULL DEFAULT false,
  display_order INT         NOT NULL DEFAULT 0,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX company_records_type_key_idx ON company_records(type_key);
CREATE INDEX company_records_pinned_idx   ON company_records(is_pinned);
CREATE INDEX company_records_order_idx    ON company_records(display_order);

CREATE TRIGGER company_records_updated_at
  BEFORE UPDATE ON company_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE company_record_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_record_types_all" ON company_record_types
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

ALTER TABLE company_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_records_all" ON company_records
  FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
