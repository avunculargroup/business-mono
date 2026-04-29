-- Documents: general-purpose document writing feature
-- Mirrors the mvp_templates / mvp_template_versions pattern

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('report','proposal','brief','memo','strategy')),
  title       text NOT NULL,
  description text,
  tags        text[] NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  content        jsonb NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES auth.users(id),
  approved_by    uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage documents"
  ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Team members can manage document versions"
  ON document_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
