-- ============================================================
-- Podcast collections — "briefing packs" (podcast-pages-review B4 / P2-10)
-- ============================================================
-- A collection is a named, ordered set of episodes with a short intro — the
-- thematic unit a CFO actually wants ("get me up to speed on custody") and the
-- natural thing to eventually hand a client or seed a piece of content from.
--
-- Per the Q-resolution (podcast-pages-review, Open questions), collections start
-- as MANUAL assembly (you/Carri), which needs no approval gate. A later "Charlie
-- proposes a collection" step would ride the existing agent_activity
-- proposed→approved gate — nothing speculative is built for it here.
--
-- Two tables, mirroring the D2 data-model note:
--   * podcast_collections       — the pack (title, intro, slug).
--   * podcast_collection_items  — membership, ordered by `position`, one row per
--     (collection, episode). ON DELETE CASCADE both ways so deleting a pack or an
--     episode never leaves an orphan.
-- ============================================================

-- ── podcast_collections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcast_collections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-facing handle for /news/podcasts/collections/<slug>. Filled once on
  -- INSERT by the shared set_slug trigger; DEFAULT '' keeps it optional in the
  -- generated Insert type (see 20260717020000_slug_default_empty).
  slug        TEXT        NOT NULL DEFAULT '',
  title       TEXT        NOT NULL,
  intro       TEXT,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS podcast_collections_slug_key
  ON podcast_collections (slug);

DROP TRIGGER IF EXISTS trg_set_slug ON podcast_collections;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON podcast_collections
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

DROP TRIGGER IF EXISTS podcast_collections_updated_at ON podcast_collections;
CREATE TRIGGER podcast_collections_updated_at
  BEFORE UPDATE ON podcast_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── podcast_collection_items ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcast_collection_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  UUID        NOT NULL REFERENCES podcast_collections(id) ON DELETE CASCADE,
  episode_id     UUID        NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  -- Curated order within the pack. Appended at max+1 on insert; the detail page
  -- renders and reorders by this.
  position       INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_podcast_collection_items_collection
  ON podcast_collection_items (collection_id, position);

-- ── RLS: two-founder team, authenticated read/write; service_role for agents ──
ALTER TABLE podcast_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "podcast_collections_all" ON podcast_collections;
CREATE POLICY "podcast_collections_all" ON podcast_collections
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

ALTER TABLE podcast_collection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "podcast_collection_items_all" ON podcast_collection_items;
CREATE POLICY "podcast_collection_items_all" ON podcast_collection_items
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));
