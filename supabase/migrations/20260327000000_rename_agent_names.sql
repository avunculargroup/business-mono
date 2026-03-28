-- Rename agent_name values to canonical character IDs across all tables.
-- Old role-based names (recorder, archivist, pm, ba, content_creator, researcher)
-- are replaced with playful first names (roger, archie, petra, bruno, charlie, rex).
-- Simon is unchanged.

-- ── agent_activity ───────────────────────────────────────────────────────────

UPDATE agent_activity SET agent_name = 'roger'   WHERE agent_name = 'recorder';
UPDATE agent_activity SET agent_name = 'archie'  WHERE agent_name = 'archivist';
UPDATE agent_activity SET agent_name = 'petra'   WHERE agent_name = 'pm';
UPDATE agent_activity SET agent_name = 'bruno'   WHERE agent_name = 'ba';
UPDATE agent_activity SET agent_name = 'charlie' WHERE agent_name = 'content_creator';
UPDATE agent_activity SET agent_name = 'rex'     WHERE agent_name = 'researcher';

-- ── platform_capabilities ────────────────────────────────────────────────────

UPDATE platform_capabilities SET agent_name = 'roger'   WHERE agent_name = 'recorder';
UPDATE platform_capabilities SET agent_name = 'archie'  WHERE agent_name = 'archivist';
UPDATE platform_capabilities SET agent_name = 'petra'   WHERE agent_name = 'pm';
UPDATE platform_capabilities SET agent_name = 'bruno'   WHERE agent_name = 'ba';
UPDATE platform_capabilities SET agent_name = 'charlie' WHERE agent_name = 'content_creator';
UPDATE platform_capabilities SET agent_name = 'rex'     WHERE agent_name = 'researcher';

-- ── capacity_gaps ────────────────────────────────────────────────────────────
-- agent_name is optional on this table but update any existing rows for consistency

UPDATE capacity_gaps SET agent_name = 'roger'   WHERE agent_name = 'recorder';
UPDATE capacity_gaps SET agent_name = 'archie'  WHERE agent_name = 'archivist';
UPDATE capacity_gaps SET agent_name = 'petra'   WHERE agent_name = 'pm';
UPDATE capacity_gaps SET agent_name = 'bruno'   WHERE agent_name = 'ba';
UPDATE capacity_gaps SET agent_name = 'charlie' WHERE agent_name = 'content_creator';
UPDATE capacity_gaps SET agent_name = 'rex'     WHERE agent_name = 'researcher';

-- ── CHECK constraints ────────────────────────────────────────────────────────
-- Wrapped in DO blocks so the migration is idempotent (safe to re-run if the
-- constraint was already created by a previous manual schema setup).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_activity_agent_name_check'
      AND conrelid = 'agent_activity'::regclass
  ) THEN
    ALTER TABLE agent_activity
      ADD CONSTRAINT agent_activity_agent_name_check
      CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_capabilities_agent_name_check'
      AND conrelid = 'platform_capabilities'::regclass
  ) THEN
    ALTER TABLE platform_capabilities
      ADD CONSTRAINT platform_capabilities_agent_name_check
      CHECK (agent_name IN ('simon', 'roger', 'archie', 'petra', 'bruno', 'charlie', 'rex'));
  END IF;
END $$;
