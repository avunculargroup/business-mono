-- Slide Builder: decks, deck_slides, assets tables

-- ──────────────────────────────────────────────────────────
-- assets
-- Shared media library for uploaded slide images
-- ──────────────────────────────────────────────────────────
CREATE TABLE assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket       TEXT NOT NULL,
  path         TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    BIGINT,
  width        INT,
  height       INT,
  alt_text     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX assets_org_id_idx ON assets(org_id);

-- ──────────────────────────────────────────────────────────
-- decks
-- ──────────────────────────────────────────────────────────
CREATE TABLE decks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  title        TEXT NOT NULL,
  theme_id     TEXT NOT NULL DEFAULT 'company-default',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'archived')),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX decks_org_id_idx ON decks(org_id);
CREATE INDEX decks_status_idx ON decks(status);

CREATE TRIGGER decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- deck_slides
-- ──────────────────────────────────────────────────────────
CREATE TABLE deck_slides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id      UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  type         TEXT NOT NULL
               CHECK (type IN ('title','section','agenda','two_column','image_caption','kpi_grid','quote','closing')),
  order_index  INT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX deck_slides_deck_id_idx ON deck_slides(deck_id);
CREATE INDEX deck_slides_order_idx   ON deck_slides(deck_id, order_index);

CREATE TRIGGER deck_slides_updated_at
  BEFORE UPDATE ON deck_slides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_all"      ON assets      FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "decks_all"       ON decks       FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "deck_slides_all" ON deck_slides FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
