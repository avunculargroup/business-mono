-- ============================================================
-- HUMAN-FRIENDLY SLUGS
--
-- Adds a `slug` column to every table that backs a detail page, so the web
-- UI can use readable URLs (/crm/companies/acme-corp) instead of raw UUIDs.
--
-- DESIGN:
--   * UUID primary keys are UNCHANGED. All foreign keys and agent_activity
--     references keep pointing at `id`. `slug` is a secondary, human-facing
--     handle only.
--   * Slugs are generated ONCE on INSERT by a BEFORE INSERT trigger and are
--     NOT regenerated when the source name changes — this keeps URLs stable.
--   * Uniqueness is per-table. Collisions get a numeric suffix (acme, acme-1).
--   * Rows with no usable source text fall back to a short slice of their id.
--
-- Tables covered (source column in parentheses):
--   projects(name), companies(name), personas(name), contacts(first+last),
--   champions(name), tasks(title), mvp_templates(title), content_items(title),
--   podcast_episodes(title), advisors_partners(name), products_services(name),
--   documents(title), campaigns(name), decks(title)
-- ============================================================

-- ── slugify: lowercase, non-alphanumerics → single dashes, trimmed ──────────
CREATE OR REPLACE FUNCTION public.slugify(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM
    regexp_replace(
      regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- ── compute_unique_slug: slugify base text, then ensure uniqueness in table ──
-- Falls back to a short id slice when the base is empty. Appends -1, -2, … on
-- collision. Excludes the row's own id so it is safe to call for updates too.
CREATE OR REPLACE FUNCTION public.compute_unique_slug(
  p_table text,
  p_base  text,
  p_id    uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base            text := nullif(public.slugify(p_base), '');
  candidate       text;
  n               int := 0;
  already_exists  boolean;
BEGIN
  IF base IS NULL THEN
    base := left(replace(p_id::text, '-', ''), 8);
  END IF;

  candidate := base;
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE slug = $1 AND id <> $2)',
      p_table
    ) INTO already_exists USING candidate, p_id;

    EXIT WHEN NOT already_exists;

    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ── set_slug trigger: build base text from the TG_ARGV source column(s) ──────
-- Only fires when slug is not already provided. Accepts one or more column
-- names; non-empty values are joined with spaces before slugifying.
CREATE OR REPLACE FUNCTION public.set_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  i    int;
  part text;
  base text := '';
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    NEW.slug := public.compute_unique_slug(TG_TABLE_NAME, NEW.slug, NEW.id);
    RETURN NEW;
  END IF;

  FOR i IN 0 .. TG_NARGS - 1 LOOP
    EXECUTE format('SELECT ($1).%I::text', TG_ARGV[i]) INTO part USING NEW;
    IF part IS NOT NULL AND part <> '' THEN
      base := base || ' ' || part;
    END IF;
  END LOOP;

  NEW.slug := public.compute_unique_slug(TG_TABLE_NAME, base, NEW.id);
  RETURN NEW;
END;
$$;

-- ── Per-table setup ─────────────────────────────────────────────────────────
-- Pattern per table: add column, backfill existing rows (oldest first so the
-- unsuffixed slug goes to the earliest row), add unique index + trigger.

-- projects(name)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.projects WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.projects SET slug = public.compute_unique_slug('projects', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.projects ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_key ON public.projects (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.projects;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- companies(name)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.companies WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.companies SET slug = public.compute_unique_slug('companies', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON public.companies (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.companies;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- personas(name)
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.personas WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.personas SET slug = public.compute_unique_slug('personas', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.personas ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS personas_slug_key ON public.personas (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.personas;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- contacts(first_name, last_name)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, first_name, last_name FROM public.contacts WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.contacts
      SET slug = public.compute_unique_slug('contacts', coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''), r.id)
      WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.contacts ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_slug_key ON public.contacts (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.contacts;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('first_name', 'last_name');

-- champions(name)
ALTER TABLE public.champions ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.champions WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.champions SET slug = public.compute_unique_slug('champions', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.champions ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS champions_slug_key ON public.champions (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.champions;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.champions
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- tasks(title)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.tasks WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.tasks SET slug = public.compute_unique_slug('tasks', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.tasks ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_slug_key ON public.tasks (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.tasks;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- mvp_templates(title)
ALTER TABLE public.mvp_templates ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.mvp_templates WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.mvp_templates SET slug = public.compute_unique_slug('mvp_templates', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.mvp_templates ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mvp_templates_slug_key ON public.mvp_templates (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.mvp_templates;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.mvp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- content_items(title) — title is nullable; empty titles fall back to id slice
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.content_items WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.content_items SET slug = public.compute_unique_slug('content_items', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.content_items ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_items_slug_key ON public.content_items (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.content_items;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- podcast_episodes(title)
ALTER TABLE public.podcast_episodes ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.podcast_episodes WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.podcast_episodes SET slug = public.compute_unique_slug('podcast_episodes', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.podcast_episodes ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS podcast_episodes_slug_key ON public.podcast_episodes (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.podcast_episodes;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.podcast_episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- advisors_partners(name)
ALTER TABLE public.advisors_partners ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.advisors_partners WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.advisors_partners SET slug = public.compute_unique_slug('advisors_partners', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.advisors_partners ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS advisors_partners_slug_key ON public.advisors_partners (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.advisors_partners;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.advisors_partners
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- products_services(name)
ALTER TABLE public.products_services ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.products_services WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.products_services SET slug = public.compute_unique_slug('products_services', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.products_services ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_services_slug_key ON public.products_services (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.products_services;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.products_services
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- documents(title)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.documents WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.documents SET slug = public.compute_unique_slug('documents', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.documents ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documents_slug_key ON public.documents (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.documents;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- campaigns(name)
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.campaigns WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.campaigns SET slug = public.compute_unique_slug('campaigns', r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.campaigns ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_slug_key ON public.campaigns (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.campaigns;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('name');

-- decks(title)
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS slug text;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, title FROM public.decks WHERE slug IS NULL ORDER BY created_at, id LOOP
    UPDATE public.decks SET slug = public.compute_unique_slug('decks', r.title, r.id) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.decks ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS decks_slug_key ON public.decks (slug);
DROP TRIGGER IF EXISTS trg_set_slug ON public.decks;
CREATE TRIGGER trg_set_slug BEFORE INSERT ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.set_slug('title');

-- ── Views: expose slug so the campaign UI can build human-friendly links ─────
-- CREATE OR REPLACE VIEW can only append columns, so slug goes last.
CREATE OR REPLACE VIEW v_campaign_overview AS
  SELECT
    c.id,
    c.name,
    c.objective,
    c.status,
    c.start_date,
    c.duration_weeks,
    (c.start_date + (c.duration_weeks * 7))                AS end_date,
    ((c.start_date + (c.duration_weeks * 7)) - CURRENT_DATE) AS days_remaining,
    COUNT(ci.id)                                           AS total_variants,
    COUNT(ci.id) FILTER (WHERE ci.status = 'published')    AS published_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'approved')     AS approved_count,
    COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'review')) AS pending_count,
    COUNT(ci.id) FILTER (WHERE ci.compliance_status = 'flagged') AS flagged_count,
    c.slug
  FROM campaigns c
  LEFT JOIN content_items ci ON ci.campaign_id = c.id
  GROUP BY c.id
  ORDER BY c.start_date DESC;

CREATE OR REPLACE VIEW v_campaign_matrix AS
  SELECT
    ci.id,
    ci.campaign_id,
    ci.beat_id,
    cb.sequence     AS beat_sequence,
    cb.title        AS beat_title,
    sa.id           AS account_id,
    sa.display_name AS account_name,
    sa.platform,
    ci.type,
    ci.is_thread,
    ci.status,
    ci.scheduled_for,
    ci.compliance_status,
    ci.compliance_classification,
    ci.needs_disclaimer,
    ci.char_count,
    ci.slug
  FROM content_items ci
  JOIN campaign_beats cb  ON cb.id = ci.beat_id
  JOIN social_accounts sa ON sa.id = ci.social_account_id
  WHERE ci.campaign_id IS NOT NULL
  ORDER BY cb.sequence ASC, sa.display_name ASC;

CREATE OR REPLACE VIEW v_podcast_ingestion_status AS
  SELECT
    e.id,
    e.title,
    e.published_at,
    e.transcript_status,
    e.transcript_source,
    e.has_timestamps,
    e.embedded_at,
    e.transcript_error,
    e.youtube_url,
    e.audio_url,
    ns.name AS source_name,
    ns.transcribe_with_deepgram,
    e.slug
  FROM podcast_episodes e
  LEFT JOIN news_sources ns ON ns.id = e.source_id
  ORDER BY e.published_at DESC;
