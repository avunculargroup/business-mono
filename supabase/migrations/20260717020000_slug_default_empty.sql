-- ============================================================
-- SLUG COLUMNS: ADD DEFAULT '' SO INSERTS DON'T HAVE TO SUPPLY slug
--
-- 20260716020000_add_human_friendly_slugs made every `slug` column NOT NULL
-- and relies on a BEFORE INSERT trigger (set_slug / set_champion_slug) to fill
-- it from the row's source columns. At runtime that's fine — the trigger runs
-- before the NOT NULL check.
--
-- But the Supabase type generator can't see triggers, so a NOT NULL column with
-- no column-level DEFAULT is emitted as REQUIRED in every table's Insert type.
-- That broke ~10 insert call sites across apps/web and apps/agents (none of
-- which pass slug, by design).
--
-- Giving slug a DEFAULT of '' makes the generator treat it as optional in the
-- Insert type while changing nothing at runtime: the trigger only computes a
-- slug when NEW.slug IS NULL OR '' (see set_slug), so the empty default is
-- always overwritten before the row lands. No row ever persists ''.
--
-- Same 14 trigger-populated tables as the slug migration (news_sources/forms
-- manage their own slugs and are intentionally excluded).
-- ============================================================

ALTER TABLE public.projects          ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.companies         ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.personas          ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.contacts          ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.champions         ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.tasks             ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.mvp_templates     ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.content_items     ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.podcast_episodes  ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.advisors_partners ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.products_services ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.documents         ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.campaigns         ALTER COLUMN slug SET DEFAULT '';
ALTER TABLE public.decks             ALTER COLUMN slug SET DEFAULT '';
