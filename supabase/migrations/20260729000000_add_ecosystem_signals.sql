-- ============================================================
-- ECOSYSTEM SIGNALS — watches + detected changes
-- Spec: docs/features/ecosystem/ecosystem-signal-feature.md
--
-- The first agent-adjacent layer over the Ecosystem registers
-- (products_services, advisors_partners). A typed watch is attached
-- to a register row; a scheduled engine
-- (apps/agents/src/lib/ecosystem/) runs the matching adapter, diffs
-- against last_state, and commits a change with its deterministic
-- payload BEFORE any narration. Materiality, summary, and the
-- compliance class are filled in a second pass.
--
-- Two invariants this schema exists to protect:
--   1. The registers stay pristine. Everything here references them
--      by FK and cascades on their delete; nothing writes back.
--   2. Facts never depend on the LLM being up. summary, materiality,
--      severity and compliance_class are all NULLABLE — a change is
--      valid, and visible, with only its payload.
-- ============================================================

-- ------------------------------------------------------------
-- A typed watch belonging to exactly one register entity. One
-- entity may have many (a vendor might have a GitHub watch, a
-- status-page watch, and a policy-diff watch). watch_type selects
-- the adapter; config carries its adapter-specific settings, whose
-- shapes are typed in @platform/shared (EcosystemWatchConfig).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ecosystem_watches (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_service_id   UUID        REFERENCES products_services(id)  ON DELETE CASCADE,
  advisor_partner_id   UUID        REFERENCES advisors_partners(id)  ON DELETE CASCADE,
  watch_type           TEXT        NOT NULL CHECK (watch_type IN (
                         'regulatory_register', 'github_release', 'github_advisory',
                         'rss', 'newsletter', 'status_page', 'attestation', 'policy_diff'
                       )),
  label                TEXT        NOT NULL,
  config               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source_url           TEXT,
  enabled              BOOLEAN     NOT NULL DEFAULT TRUE,
  -- realtime = event/email-driven (the newsletter watch rides the existing
  -- Fastmail spine); it is never polled by the scan.
  check_frequency      TEXT        NOT NULL DEFAULT 'daily'
                         CHECK (check_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
  last_checked_at      TIMESTAMPTZ,                  -- set on every run, change or no change
  last_change_at       TIMESTAMPTZ,                  -- set only when a change was emitted
  -- The diff anchor: last-seen release id / item guids / content hash /
  -- attestation date / register status. The adapter is a pure function of
  -- (config, last_state, fetched) → (changes[], next_state).
  last_state           JSONB,
  consecutive_failures INT         NOT NULL DEFAULT 0,   -- drives backoff and health
  health               TEXT        NOT NULL DEFAULT 'healthy'
                         CHECK (health IN ('healthy', 'degraded', 'failing')),
  -- Explicit materiality weight for this watch's entity. The spec's open
  -- question on centrality, answered the way it recommends: an explicit
  -- number beats inferring importance from australian_owned or category.
  centrality           NUMERIC(3,2) NOT NULL DEFAULT 1.00
                         CHECK (centrality > 0 AND centrality <= 2),
  owner_id             UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  notes                TEXT,
  created_by           UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one parent. Enforced in the server actions too (the
  -- contracts contact_id/company_id pattern); this is belt and braces.
  CONSTRAINT ecosystem_watches_one_parent
    CHECK (num_nonnulls(product_service_id, advisor_partner_id) = 1)
);

DROP TRIGGER IF EXISTS ecosystem_watches_updated_at ON ecosystem_watches;
CREATE TRIGGER ecosystem_watches_updated_at
  BEFORE UPDATE ON ecosystem_watches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_watches_product ON ecosystem_watches(product_service_id);
CREATE INDEX IF NOT EXISTS idx_watches_advisor ON ecosystem_watches(advisor_partner_id);
-- The due-selection query on every scan tick.
CREATE INDEX IF NOT EXISTS idx_watches_due     ON ecosystem_watches(enabled, check_frequency, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_watches_health  ON ecosystem_watches(health);

-- ------------------------------------------------------------
-- One detected change. Phase A (detection) writes payload, title,
-- dedup_key, occurred_at, external_url. Phase B (enrichment) fills
-- summary, materiality, severity, compliance_class. A Phase B
-- failure therefore leaves a valid un-narrated change in the feed
-- rather than losing it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ecosystem_changes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id           UUID        NOT NULL REFERENCES ecosystem_watches(id) ON DELETE CASCADE,
  -- Denormalised from the watch so the feed query needs no double join.
  product_service_id UUID        REFERENCES products_services(id) ON DELETE CASCADE,
  advisor_partner_id UUID        REFERENCES advisors_partners(id) ON DELETE CASCADE,
  -- Denormalised display name: preserves WHO the change was about even if
  -- the register row is later renamed (contracts.counterparty_name rationale).
  entity_name        TEXT        NOT NULL,
  change_type        TEXT        NOT NULL CHECK (change_type IN (
                       'release', 'advisory', 'staleness', 'discontinuity',
                       'policy_change', 'pricing_change', 'regulatory_change',
                       'corporate_event', 'incident', 'mention', 'other'
                     )),
  title              TEXT        NOT NULL,      -- payload-derived, never LLM-written
  summary            TEXT,                      -- narrator output; NULL until enrichment
  -- The deterministic finding, and the narration contract's only source:
  -- the narrator may reference nothing outside this object.
  payload            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  dedup_key          TEXT        NOT NULL,      -- version string / GHSA id / incident id / content hash
  materiality        INT         CHECK (materiality IS NULL OR (materiality >= 0 AND materiality <= 100)),
  severity           TEXT        CHECK (severity IS NULL OR severity IN ('info', 'low', 'medium', 'high', 'critical')),
  -- Lex's classification. NULL = not yet classified, which the client-promotion
  -- gate treats exactly like a non-neutral class: not promotable.
  compliance_class   TEXT        CHECK (compliance_class IS NULL OR compliance_class IN (
                       'neutral', 'valuation_adjacent', 'advice_adjacent', 'solvency_adjacent'
                     )),
  compliance_notes   TEXT,
  status             TEXT        NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'acknowledged', 'actioned', 'dismissed', 'archived')),
  pinned             BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Director flag for the future companion app. Setting it on a non-neutral
  -- change requires the (dormant) Lex gate — enforced in the server action.
  client_relevant    BOOLEAN     NOT NULL DEFAULT FALSE,
  curator_note       TEXT,                      -- first-class human annotation: WHY this matters
  occurred_at        TIMESTAMPTZ,               -- when the change happened, from payload
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_url       TEXT,
  source             TEXT        NOT NULL DEFAULT 'ecosystem_workflow',
  acknowledged_by    UUID        REFERENCES team_members(id) ON DELETE SET NULL,
  acknowledged_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS ecosystem_changes_updated_at ON ecosystem_changes;
CREATE TRIGGER ecosystem_changes_updated_at
  BEFORE UPDATE ON ecosystem_changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Idempotency: one change per (watch, dedup_key). Detection upserts on this,
-- so a re-run or two overlapping scan ticks cannot double-insert. Both columns
-- are NOT NULL, so the NULLs-are-distinct trap does not apply here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_changes_dedup ON ecosystem_changes(watch_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_changes_product  ON ecosystem_changes(product_service_id);
CREATE INDEX IF NOT EXISTS idx_changes_advisor  ON ecosystem_changes(advisor_partner_id);
CREATE INDEX IF NOT EXISTS idx_changes_status   ON ecosystem_changes(status);
CREATE INDEX IF NOT EXISTS idx_changes_type     ON ecosystem_changes(change_type);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON ecosystem_changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_client   ON ecosystem_changes(client_relevant) WHERE client_relevant = TRUE;
-- Phase B re-enrichment sweeps this.
CREATE INDEX IF NOT EXISTS idx_changes_unenriched ON ecosystem_changes(detected_at) WHERE summary IS NULL;

-- ------------------------------------------------------------
-- RLS — the agents server writes through service_role; the web app
-- reads and curates as authenticated. Same policy shape as every
-- other agent-written table (see 20260330000000).
--
-- When the companion app arrives, client visibility is a NEW,
-- NARROWER policy over the client_relevant = true AND
-- compliance_class = 'neutral' subset — never a loosening of these.
-- ------------------------------------------------------------
ALTER TABLE ecosystem_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ecosystem_watches_all" ON ecosystem_watches;
CREATE POLICY "ecosystem_watches_all" ON ecosystem_watches
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "ecosystem_changes_all" ON ecosystem_changes;
CREATE POLICY "ecosystem_changes_all" ON ecosystem_changes
  FOR ALL
  USING      (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- ------------------------------------------------------------
-- Views
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW v_ecosystem_feed AS
  SELECT
    ch.id,
    ch.change_type,
    ch.title,
    ch.summary,
    ch.severity,
    ch.materiality,
    ch.compliance_class,
    ch.status,
    ch.pinned,
    ch.client_relevant,
    ch.curator_note,
    ch.occurred_at,
    ch.detected_at,
    ch.external_url,
    ch.entity_name,
    ps.category AS product_category,
    ap.type     AS advisor_type,
    ch.product_service_id,
    ch.advisor_partner_id,
    ps.slug     AS product_slug,
    ap.slug     AS advisor_slug,
    w.label     AS watch_label,
    w.watch_type,
    tm.full_name AS owner_name
  FROM ecosystem_changes ch
  JOIN ecosystem_watches w ON w.id = ch.watch_id
  LEFT JOIN products_services ps ON ps.id = ch.product_service_id
  LEFT JOIN advisors_partners ap ON ap.id = ch.advisor_partner_id
  LEFT JOIN team_members tm ON tm.id = w.owner_id
  WHERE ch.status NOT IN ('dismissed', 'archived')
  ORDER BY ch.pinned DESC, ch.materiality DESC NULLS LAST, ch.detected_at DESC;

COMMENT ON VIEW v_ecosystem_feed IS
  'The internal Signals feed: live changes with entity context, pinned first then most material. Excludes dismissed/archived. Slugs are carried so the feed can deep-link to the register row without a second query.';

CREATE OR REPLACE VIEW v_ecosystem_watch_health AS
  SELECT
    w.id,
    w.label,
    w.watch_type,
    w.enabled,
    w.check_frequency,
    w.health,
    w.consecutive_failures,
    w.last_checked_at,
    w.last_change_at,
    (CURRENT_DATE - w.last_checked_at::date) AS days_since_check,
    COALESCE(ps.name, ap.name) AS entity_name,
    tm.full_name AS owner_name
  FROM ecosystem_watches w
  LEFT JOIN products_services ps ON ps.id = w.product_service_id
  LEFT JOIN advisors_partners ap ON ap.id = w.advisor_partner_id
  LEFT JOIN team_members tm ON tm.id = w.owner_id
  WHERE w.enabled = TRUE
  ORDER BY
    CASE w.health WHEN 'failing' THEN 1 WHEN 'degraded' THEN 2 ELSE 3 END,
    w.last_checked_at ASC NULLS FIRST;

COMMENT ON VIEW v_ecosystem_watch_health IS
  'Is the hub actually watching? Enabled watches with failing/degraded first, never-checked before stale. An unattended failing watch is a silent trust failure, which is why this is a surface and not a log line.';
