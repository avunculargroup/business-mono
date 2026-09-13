-- ============================================================
-- COMPLIANCE DOCUMENTS AND COMPANY PROFILE
-- ============================================================
-- Depends on: 20260910000000_rls_hardening.sql
--
-- These two tables are an invention, and this comment is the
-- flag on it.
--
-- The client-app spec bundle treats compliance_documents as an
-- existing feature — "Reuses the existing compliance_documents
-- library rather than introducing a second copy of the FSG. This
-- is the point of having built that feature." It was never built.
-- Neither was company_profile, which naming.md cites as the
-- source of the legal and trading names, nor contracts, nor
-- compliance_obligations.
--
-- Two of the four are created here and two are not, on one test:
-- does the client app stop without it?
--
--   compliance_documents  The blocking gate serves the Service
--                         Statement from here — the plain statement
--                         of what Minute is and is not, which every
--                         subscriber acknowledges before they see
--                         anything. Created.
--
--   company_profile       Every /prepare export carries a legal
--                         identity block in its front matter, and
--                         an export naming no identifiable entity
--                         is worse than no export. Created.
--
--   contracts             Only a nullable FK on
--                         commercial_relationships points at it.
--                         Not created; the FK is omitted and the
--                         column carries a comment saying why.
--
--   compliance_obligations  Template review_due_date is said to
--                         "feed" it. Nothing consumes it yet, so
--                         the column and the review view exist
--                         and the calendar does not. Deferred.
--
-- NOTHING HERE IS SEEDED. There is no Service Statement row and no
-- ABN, because both are documents to be drafted rather than data to
-- be invented. An empty table fails loudly at the gate; a
-- placeholder ABN ships to whoever reads the export.
-- ============================================================


-- ------------------------------------------------------------
-- compliance_documents
-- ------------------------------------------------------------
-- Deliberately small. This is the minimum the Service Statement
-- gate and the /prepare front matter need, not a document
-- management system. Widen it when something needs it to be wider.
-- ------------------------------------------------------------

CREATE TABLE compliance_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'service_statement' is the blocking gate's document: what the
  -- service is and is not. Deliberately NOT 'fsg' — no Financial
  -- Services Guide is required, and publishing one would wrongly
  -- imply an AFS authorisation BTS does not hold and has never held.
  --
  -- 'information_notice' is the standing notice carried in the app
  -- shell and embedded in every /prepare export. Not a "general
  -- advice warning": that phrase implies licensed general advice,
  -- which is a different thing from factual information.
  doc_type       TEXT NOT NULL
                 CHECK (doc_type IN ('service_statement', 'information_notice',
                                     'privacy_policy', 'terms')),

  title          TEXT NOT NULL,
  version        TEXT NOT NULL,

  -- Markdown. Served verbatim to the subscriber at the gate and
  -- embedded verbatim in every /prepare export. Not templated,
  -- not generated, not summarised.
  body           TEXT NOT NULL,

  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'under_review', 'active', 'superseded', 'archived')),

  effective_from DATE,

  notes          TEXT,   -- internal only
  created_by     UUID REFERENCES team_members(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER compliance_documents_updated_at
  BEFORE UPDATE ON compliance_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX idx_compliance_documents_type_version
  ON compliance_documents(doc_type, version);

-- One active version per type. The gate asks for "the active
-- Service Statement" and has to get exactly one answer; two would
-- mean half the subscriber base acknowledged a different document
-- and nobody would notice until it mattered.
CREATE UNIQUE INDEX idx_compliance_documents_one_active
  ON compliance_documents(doc_type)
  WHERE status = 'active';

COMMENT ON TABLE compliance_documents IS
  'Client-facing statements of position. The blocking gate serves the active service_statement row; the app shell and every /prepare export carry the active information_notice row verbatim. Neither is a regulatory document — BTS holds no AFS authorisation and none is required.';


-- ------------------------------------------------------------
-- company_profile
-- ------------------------------------------------------------
-- A singleton. The three registers of the company name live here
-- — see .claude/skills/bts-design/references/naming.md, which
-- already cites company_profile.legal_name and .trading_name as
-- though this existed.
--
-- No licence_number, no licence_holder, no ar_number. BTS holds no
-- AFS authorisation and has never needed one, so columns for those
-- would be columns that can only ever be empty or wrong — and an
-- empty licence field on an export invites the reader to wonder
-- which it is.
--
-- The singleton is enforced rather than assumed: a second row
-- would give two /prepare exports two different ABNs.
-- ------------------------------------------------------------

CREATE TABLE company_profile (
  id             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),

  legal_name     TEXT NOT NULL,   -- 'Bitcoin Treasury Solutions Pty Ltd'
  trading_name   TEXT NOT NULL,   -- 'Bitcoin Treasury Solutions'

  -- What identifies the entity to an auditor or a regulator reading
  -- a /prepare export. The ABN is often the only thing that makes a
  -- company name unambiguous.
  abn            TEXT,
  acn            TEXT,

  -- The Service Statement's variable schema sources everything
  -- below. Sections 11 and 12 give a subscriber somewhere to send a
  -- complaint and someone to contact, and a statement that names
  -- neither is a statement that has not been finished.
  registered_address  TEXT,
  registered_state    TEXT,
  registered_postcode TEXT,

  public_phone        TEXT,
  public_email        TEXT,
  public_website      TEXT,

  -- Section 11. Separate from the public contact details because a
  -- complaint should reach a named person or role rather than a
  -- general inbox, and because BTS may want those to differ.
  complaints_contact  TEXT,
  complaints_email    TEXT,
  complaints_phone    TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER company_profile_updated_at
  BEFORE UPDATE ON company_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE company_profile IS
  'Singleton. Legal identity for anything an auditor may read: /prepare export front matter and the Service Statement. Unseeded on purpose — a placeholder ABN would ship.';


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Subscribers read both, and only the active documents. This is
-- the first pair of client read policies in the schema; the rest
-- arrive in the directory and signals migration.
--
-- current_client_account_id() does not exist yet — it lands in
-- the client tables migration, which is next. So the client read
-- policies for these two tables are created there, alongside it,
-- rather than being written here against a function that has not
-- been defined. Splitting them is uglier than it looks in a diff
-- and correcter than the alternative.
-- ------------------------------------------------------------

ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profile      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_documents_team" ON compliance_documents
  FOR ALL USING (is_team_member());

CREATE POLICY "company_profile_team" ON company_profile
  FOR ALL USING (is_team_member());


-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- Should fail on idx_compliance_documents_one_active:
--   two service_statement rows, both status = 'active'.
--
-- Should fail on the doc_type CHECK, because no FSG is required and
-- publishing one would imply an authorisation BTS does not hold:
--   INSERT INTO compliance_documents (doc_type, title, version, body)
--   VALUES ('fsg', 'x', '1.0', 'x');
--
-- Should fail on the id CHECK:
--   INSERT INTO company_profile (id, legal_name, trading_name)
--   VALUES (FALSE, 'x', 'y');
--
-- Both tables should be empty after this migration. If either is
-- not, someone seeded a placeholder — remove it.
-- ------------------------------------------------------------
