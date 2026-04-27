-- ============================================================
-- PLATFORM FILES (migration: 20260427120000_add_platform_files)
-- General-purpose file library for BTS internal platform.
-- Separate from the slide-assets bucket used by the deck builder.
-- ============================================================

CREATE TABLE platform_files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT        NOT NULL DEFAULT 'bts',
  name              TEXT        NOT NULL,           -- display name (renameable)
  original_filename TEXT        NOT NULL,           -- filename as uploaded
  bucket            TEXT        NOT NULL DEFAULT 'platform-files',
  storage_path      TEXT        NOT NULL,
  mime_type         TEXT        NOT NULL,
  byte_size         BIGINT,
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  is_public         BOOLEAN     NOT NULL DEFAULT false,
  uploaded_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_files_org      ON platform_files(org_id);
CREATE INDEX idx_platform_files_created  ON platform_files(created_at DESC);
CREATE INDEX idx_platform_files_tags     ON platform_files USING GIN(tags);

CREATE TRIGGER platform_files_updated_at
  BEFORE UPDATE ON platform_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE platform_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_files_all" ON platform_files
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
