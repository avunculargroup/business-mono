-- ============================================================
-- PRODUCT IMAGES
-- Migration: 20260923000000_product_images
-- ============================================================
-- A product or service can carry several uploaded images, one of
-- which is featured. Each image has a focal point, so the same
-- file crops sensibly into a square tile or a wide banner.
--
-- products_services.product_image_url is left in place but no
-- longer read or written by the app. It held an external link,
-- not a stored file, so there is nothing to move across, and
-- dropping it would discard any links already entered.
-- ============================================================


-- ------------------------------------------------------------
-- Gallery rows
-- ------------------------------------------------------------
-- focal_x / focal_y are percentages from the top-left corner and
-- feed CSS object-position directly. 50/50 is centre, which is
-- what object-fit: cover does with no position at all, so an
-- untouched image renders exactly as it would have anyway.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_images (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id UUID         NOT NULL,
  storage_path       TEXT         NOT NULL UNIQUE,
  filename           TEXT,
  mime_type          TEXT,
  byte_size          BIGINT,
  width              INTEGER,
  height             INTEGER,
  alt_text           TEXT,
  focal_x            NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y            NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  sort_order         INTEGER      NOT NULL DEFAULT 0,
  created_by         UUID         REFERENCES team_members(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT product_images_product_service_id_fkey
    FOREIGN KEY (product_service_id) REFERENCES products_services(id) ON DELETE CASCADE,
  -- Target for the composite featured-image key below.
  CONSTRAINT product_images_id_product_key UNIQUE (id, product_service_id)
);

CREATE OR REPLACE TRIGGER product_images_updated_at
  BEFORE UPDATE ON product_images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images(product_service_id, sort_order, created_at);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_images_team" ON product_images;
CREATE POLICY "product_images_team" ON product_images
  FOR ALL USING (is_team_member());


-- ------------------------------------------------------------
-- The featured image
-- ------------------------------------------------------------
-- A pointer on the parent rather than an is_featured flag on the
-- child: one column can only ever name one image, so "two
-- featured images" is unrepresentable instead of guarded.
--
-- The key is composite so the pointer cannot name another
-- product's image. Deleting the featured image clears only the
-- pointer (PG15 column-list SET NULL) — the app then falls back
-- to the first image in the gallery.
-- ------------------------------------------------------------

ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS featured_image_id UUID;

ALTER TABLE products_services
  DROP CONSTRAINT IF EXISTS products_services_featured_image_fkey;
ALTER TABLE products_services
  ADD CONSTRAINT products_services_featured_image_fkey
  FOREIGN KEY (featured_image_id, id)
  REFERENCES product_images(id, product_service_id)
  ON DELETE SET NULL (featured_image_id);


-- ------------------------------------------------------------
-- Storage bucket
-- ------------------------------------------------------------
-- Private, like every other bucket here; pages render through
-- signed URLs. Team members only — the platform-files policies
-- predate is_team_member() and still grant any authenticated
-- session, which is exactly what the RLS hardening closed on
-- tables.
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_images_objects_insert" ON storage.objects;
CREATE POLICY "product_images_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_team_member());

DROP POLICY IF EXISTS "product_images_objects_select" ON storage.objects;
CREATE POLICY "product_images_objects_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member());

DROP POLICY IF EXISTS "product_images_objects_update" ON storage.objects;
CREATE POLICY "product_images_objects_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member())
  WITH CHECK (bucket_id = 'product-images' AND public.is_team_member());

DROP POLICY IF EXISTS "product_images_objects_delete" ON storage.objects;
CREATE POLICY "product_images_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_team_member());
