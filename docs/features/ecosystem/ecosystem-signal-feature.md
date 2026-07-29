# Feature Spec — Ecosystem Signals (What's Changed)

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Ecosystem Watches, Change Detection, and the Signals Feed
**Status:** Draft
**Last updated:** 2026-07-29

-----

## Overview

The Ecosystem section (`/products`, `/advisors`) is today a pair of human-maintained reference registers. No agent reads or writes them; a director enters everything by hand. This feature adds the first agent-adjacent layer on top of those registers: a **signal engine** that watches the entities BTS features and surfaces **what has changed** — a firmware release, a security advisory, a proof-of-reserves attestation that has gone quiet, a Terms of Service that quietly moved.

The design goal is a trusted hub for a fiduciary audience. A CFO or Trustee should not have to follow twenty vendors on X to learn that the hardware wallet holding eight figures shipped a firmware fix, or that a custodian's last attestation is now a year old. The engine does the watching; a director curates; the feed reports facts.

Three principles carry over from the rest of the platform and shape every decision below:

1. **Deterministic before LLM.** Detection extracts structured, verifiable facts (version strings, CVE ids, attestation dates, diff hashes) and commits them *before* any narration. LLMs narrate the change; they never decide whether a change occurred.
1. **The registers stay pristine.** Watches and changes are a **separate layer** that references `products_services` and `advisors_partners` by foreign key. No agent writes back to the registers. They remain director-owned, exactly as documented in `docs/features/ecosystem/README.md`.
1. **Compliance is classified at ingest, not bolted on later.** Lex tags every change with a compliance classification the moment it is detected. For the internal feed this is a label, not a gate. It becomes a gate the day a change is promoted to the client-facing companion app.

-----

## Scope

### In scope

- `ecosystem_watches` — typed watches attached to a product/service or advisor/partner
- `ecosystem_changes` — detected, scored, classified change events (the findings)
- Five watch adapters for v1: **regulatory register** (AUSTRAC DCE / ASIC), **GitHub** (releases, tags, security advisories), **RSS / newsletter** (via Fastmail catch-all alias), **vendor status & incident pages**, **attestation & policy-page diffs**. The regulatory-register adapter is the highest-value service signal and is built first (see Service signals and Migration & build notes).
- Service-shaped change types alongside the product-shaped ones: `pricing_change`, `regulatory_change`, `corporate_event`. The first two reuse existing adapters; only the regulatory register is a new mechanism.
- The Mastra ingestion workflow (detection → enrichment), idempotent and testable
- Materiality scoring for the CFO lens (Rex) and payload-only narration
- Lex compliance classification at ingest
- The **Signals feed** — a new internal surface under the Ecosystem sidebar grouping
- A per-entity **What's changed** section on product/advisor detail pages
- Watch health monitoring (which watches are stale or failing)
- Agent-readable views for the feed, watch health, and (future) Simon's digest

### Out of scope

- **Any client-facing surface.** This build is internal only. The companion app consumes this data spine later; the `client_relevant` flag and `compliance_class` are laid down now so that promotion is a UI change, not a schema migration.
- Decision tools — calculators, board-paper generators, allocation models. Separate feature.
- Writing back to the registers (categories, ratings, "recommended" flags) — the engine reports change; it never editorialises the register.
- Rankings, scores-as-recommendations, or any "best wallet" framing. Prohibited by the AR obligations, not merely deferred.
- Real-time GitHub webhooks (v1 polls; see Open Questions).
- Automated remediation ("upgrade now" actions). The engine reports; the human acts.

-----

## User Stories

**As a director, I need to:**

- Attach one or more watches to a product or advisor without touching the register row itself
- Open a single feed of everything that has changed across the ecosystem, most material first
- See the *fact* of a change — old version → new version, CVE severity, days since last attestation — in plain, neutral language
- Acknowledge, dismiss, pin, or annotate a change so the feed reflects what we have actually reviewed
- Add a curator note explaining *why* a change matters ("only affects the Mk3; most clients are on the Q") — the annotation that turns a generic feed into an informed one
- Flag a change as client-relevant so it is queued for the future companion app — subject to its compliance classification
- Learn the moment a featured service drops off, or changes status on, the AUSTRAC DCE or ASIC register — the hard, verifiable fact a Trustee is meant to be watching and rarely is
- See at a glance which watches have gone quiet or started failing, so the hub stays trustworthy
- Receive an optional Signal digest from Simon when high-materiality changes land

**As the ingestion workflow, I need to:**

- Select every enabled watch that is due for a check based on its `check_frequency`
- Run the correct adapter for each `watch_type` and fetch current state
- Diff current state against `last_state` and emit a change only when something actually moved
- Never emit the same change twice (idempotency via `dedup_key`)
- Commit the deterministic payload first, then enrich with score, narration, and classification in a second pass
- Update the watch's `last_state`, `last_checked_at`, and health counters on every run

**As Rex (scorer), I need to:**

- Assign a materiality score to each change for the CFO lens, from the change type, the entity's centrality, severity, and recency

**As Lex (compliance), I need to:**

- Classify every change as `neutral`, `valuation_adjacent`, `advice_adjacent`, or `solvency_adjacent`, with a short rationale
- Do this at ingest so the classification is ready before any promotion decision is made

**As the narrator, I need to:**

- Write the one-line `summary` using only vocabulary present in the change `payload` — no metrics, adjectives, or recommendations that are not in the facts

-----

## The compliance seam

This is the part to get right on paper before any code, because it is one careless sentence away from an AR giving product advice.

**The rule for the internal feed:** report the fact of a change in neutral terms. Never recommend, never rank, never characterise a change as good or bad news.

| Allowed (neutral fact) | Prohibited (implied advice / valuation) |
|---|---|
| "Coldcard released firmware 6.3.4 on 12 July." | "Coldcard released an important security fix — update immediately." |
| "Proof-of-reserves last attested 401 days ago; expected cadence is quarterly." | "This custodian may be insolvent." |
| "Vendor X updated its custody agreement on 3 July." | "This change weakens your legal protection." |
| "GHSA-xxxx: severity High, affects versions < 2.1." | "You are at risk until you patch." |
| "Entity X no longer appears on the AUSTRAC DCE register as of 14 July." | "This exchange is operating illegally and is unsafe to use." |

`change_type` is a neutral category and is **never** colour-coded as positive or negative. A `release` is an event, not good news — it does not get a green badge. This is the neutral-delta rule applied to the ecosystem: severity bands may use the warning/destructive palette (a `critical` advisory reads as urgent, which is factual), but gold remains reserved solely for freshness/recency indicators, and no change ever renders in success-green.

**Lex's role in v1** is to attach `compliance_class` and `compliance_notes` to every change. Because the feed is internal and auto-surfaces, Lex does **not** suspend the workflow — directors see everything. The classification is the pre-computed gate for the client-promotion path: a change classified `solvency_adjacent` or `advice_adjacent` cannot be flagged `client_relevant` without an explicit Lex suspend/resume approval (future feature). The gate is built now and dormant; it activates the day the companion app ships.

A `regulatory_change` — an entity appearing, disappearing, or changing status on a regulatory register — always classifies as `solvency_adjacent` at minimum. It is the highest-value signal for a fiduciary and the one most capable of harm if stated loosely: a de-listing reported as fact is fine, the same de-listing editorialised into a solvency or legality judgment is not. It therefore never reaches a client screen without the Lex gate, and the adapter itself must be exact (see Service signals).

-----

## Service signals

The engine does not care whether an entity is a product or a service. It cares what kind of change can be observed, and from what source. The register already carries both: it is `products_services`, and its category CHECK spans `custody`, `exchange`, `treasury_management`, `lending`, `insurance` alongside the wallet and consulting categories. An on-ramp is an `exchange` row; collaborative custody is a `custody` row. No second table, no special case.

What differs is the *shape* of the change:

- **Product-shaped changes are version-shaped.** You diff a version string — releases, tags, advisories. Handled by the GitHub adapter.
- **Service-shaped changes are state-shaped.** You diff a page, a date, or a register entry — pricing, terms, incidents, attestation freshness, registration status, corporate events.

An entity can be both at once. Collaborative custody is the cleanest example: open-source signing tooling on top (version-shaped — a client library's releases) sitting on a regulated custody service underneath (state-shaped — the custody agreement, the attestation cadence, the trust-company's register entry). One register row, several watches, mixed shapes. The many-watches-per-entity model already carries this; a service simply tilts toward different `watch_type` values.

Three service change types are added, and only one needs a genuinely new adapter:

- **`pricing_change`** — a fee schedule is just a page to diff. Reuse the `policy_diff` adapter with a `content_kind: "pricing"` hint in config; classify the resulting change as `pricing_change` rather than `policy_change`. No new mechanism.
- **`corporate_event`** — raises, acquisitions, layoffs, executive exits, regulatory action. These arrive off the `rss` / `newsletter` adapter, or off the existing Tavily/Jina research pipeline, as a keyword-matched item elevated from `mention` to `corporate_event` with higher materiality. No new adapter — this is the FTX-shaped hole in everyone's memory, closed by classification.
- **`regulatory_change`** — a new adapter, and the priority build. Covered below.

### The `regulatory_register` watch

A lookup against Australia's regulatory registers — primarily the **AUSTRAC Digital Currency Exchange (DCE) register** and the relevant **ASIC registers** (AFSL/AR, and company status). Emits a `regulatory_change` when a watched entity appears, disappears, or changes status.

This is the single most valuable service signal the hub can offer a Trustee, and also the most error-prone, so the design is deliberately conservative:

- **Match on an exact identifier, never a fuzzy name.** Registered legal name, trading name, and a subsidiary's name diverge constantly, and a false "de-listed" is a quiet defamation of a counterparty. The watch config holds the *exact* registered identifier (AUSTRAC enrolment / registration number, or ASIC ACN/AFSL/AR number), not a name to search. Detection compares status for that identifier only.
- **Registers are not uniformly machine-readable.** Where a structured lookup exists, use it; where only a searchable page exists, the adapter fetches the specific record by identifier and parses status, and records on the watch when a register cannot be reliably read rather than guessing.
- **The identifier lives in `config`, not on the register row** — keeping the "registers stay pristine, director-owned" principle intact and adding no agent-relevant field to `products_services`. Promoting it to a first-class `regulatory_ref` column on the register is cleaner data modelling and a reasonable future move, but out of scope for v1.
- **Every `regulatory_change` is `solvency_adjacent` at minimum**, so it auto-surfaces internally but is hard-gated on any client promotion. The precision bar is set by the harm a wrong result would do, not by the value of a right one.

-----

## Data Model

Two tables, plus their views. Both reference the existing registers by FK and cascade on register delete. RLS is the platform default: a single `*_all` policy granting authenticated users full access.

### `ecosystem_watches`

A typed watch belonging to exactly one register entity. A product or advisor may have many watches (a wallet vendor might have a GitHub watch, a newsletter watch, and a status-page watch).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `product_service_id` | UUID | FK → `products_services` `ON DELETE CASCADE`. Nullable. |
| `advisor_partner_id` | UUID | FK → `advisors_partners` `ON DELETE CASCADE`. Nullable. |
| `watch_type` | TEXT | CHECK: `regulatory_register`, `github_release`, `github_advisory`, `rss`, `newsletter`, `status_page`, `attestation`, `policy_diff`. Selects the adapter. |
| `label` | TEXT | Human name, e.g. `Coldcard firmware`. |
| `config` | JSONB | Adapter-specific configuration (shapes below). |
| `source_url` | TEXT | Canonical URL for display and linking. |
| `enabled` | BOOLEAN | Default `true`. |
| `check_frequency` | TEXT | CHECK: `realtime`, `hourly`, `daily`, `weekly`. `realtime` = event/email-driven, not polled. Default `daily`. |
| `last_checked_at` | TIMESTAMPTZ | Set on every run, change or no change. |
| `last_change_at` | TIMESTAMPTZ | Set only when a change was emitted. |
| `last_state` | JSONB | The diff anchor — last-seen version / etag / content hash / attestation date. The adapter compares current state against this. |
| `consecutive_failures` | INT | Default `0`. Drives backoff and health. |
| `health` | TEXT | CHECK: `healthy`, `degraded`, `failing`. Default `healthy`. |
| `owner_id` | UUID | FK → `team_members`. |
| `notes` | TEXT | Internal context. |
| `created_by` | UUID | FK → `team_members`. Create-only. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated by the `update_updated_at` trigger. |

**Parent constraint:** exactly one of `product_service_id` / `advisor_partner_id` must be set. Enforced at the application layer (consistent with the contracts `contact_id`/`company_id` pattern), with a belt-and-braces CHECK:

```sql
CHECK (num_nonnulls(product_service_id, advisor_partner_id) = 1)
```

**`config` shapes by `watch_type`:**

```jsonc
// github_release — watch releases and/or tags
{ "owner": "Coldcard", "repo": "firmware", "include_prereleases": false, "track": "releases" }

// github_advisory — watch published security advisories (GHSA) for a repo
{ "owner": "spesmilo", "repo": "electrum" }

// rss — any RSS/Atom feed
{ "feed_url": "https://blog.example.com/rss.xml", "match": null }

// newsletter — inbound email via Fastmail catch-all alias
{ "recipient_local_part": "coldcard", "subdomain": "feed.btsy.com.au" }

// status_page — Atlassian Statuspage, Instatus, or similar
{ "provider": "statuspage", "base_url": "https://status.example.com", "api": "https://status.example.com/api/v2/incidents.json" }

// attestation — proof-of-reserves / attestation freshness
{ "attestation_url": "https://example.com/attestation", "expected_cadence_days": 90, "date_selector": "meta[name='attested-at']" }

// policy_diff — ToS / privacy / custody-agreement page diffing
{ "page_url": "https://example.com/terms", "content_selector": "main", "min_change_ratio": 0.02 }

// policy_diff used for pricing — same adapter, content_kind tips the classifier to pricing_change
{ "page_url": "https://example.com/pricing", "content_selector": "main", "content_kind": "pricing", "min_change_ratio": 0.02 }

// regulatory_register — status lookup by EXACT identifier, never a name search
{ "register": "austrac_dce", "identifier": "DCE100XXXXXX-001", "expected_status": "registered" }
{ "register": "asic_afsl", "identifier": "AFSL:123456", "expected_status": "current" }
```

**On `last_state`:** this is what makes detection idempotent and cheap. For `github_release` it holds the last release id and tag; for `rss` the last-seen item guids; for `policy_diff` the last content hash; for `attestation` the last attestation date. The adapter is a pure function of `(config, last_state, fetched_state) → (changes[], new_last_state)`.

-----

### `ecosystem_changes`

One detected change. This is a finding: deterministic payload first, enrichment second.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `watch_id` | UUID | FK → `ecosystem_watches` `ON DELETE CASCADE`. |
| `product_service_id` | UUID | Denormalised from the watch, for feed queries without a double join. |
| `advisor_partner_id` | UUID | Denormalised from the watch. |
| `entity_name` | TEXT | Denormalised display name. Preserves who the change was about even if the register row is later renamed (same rationale as `contracts.counterparty_name`). |
| `change_type` | TEXT | CHECK: `release`, `advisory`, `staleness`, `discontinuity`, `policy_change`, `pricing_change`, `regulatory_change`, `corporate_event`, `incident`, `mention`, `other`. |
| `title` | TEXT | Deterministic, payload-derived headline. Never LLM-written. |
| `summary` | TEXT | Narrator output. Payload-only vocabulary. NULL until the enrichment pass runs. |
| `payload` | JSONB | The deterministic finding: the structured facts. The narration contract source — the narrator may reference nothing outside it. |
| `dedup_key` | TEXT | Derived from payload (version string, CVE id, incident id, content hash). Unique per watch. |
| `materiality` | INT | Rex's score, 0–100. Drives feed prominence and sort. NULL until enrichment. |
| `severity` | TEXT | CHECK: `info`, `low`, `medium`, `high`, `critical`. Display band, derived from payload + materiality. |
| `compliance_class` | TEXT | CHECK: `neutral`, `valuation_adjacent`, `advice_adjacent`, `solvency_adjacent`. Lex's classification. |
| `compliance_notes` | TEXT | Lex's short rationale. |
| `status` | TEXT | CHECK: `new`, `acknowledged`, `actioned`, `dismissed`, `archived`. Director curation state. Default `new`. |
| `pinned` | BOOLEAN | Default `false`. Director can keep a change at the top of the feed. |
| `client_relevant` | BOOLEAN | Default `false`. Director flag for the future companion app. Setting it on an `advice_adjacent`/`solvency_adjacent` change requires the Lex gate (future). |
| `curator_note` | TEXT | First-class human annotation — *why* this matters. |
| `occurred_at` | TIMESTAMPTZ | When the change actually happened (release date, incident start). From payload. |
| `detected_at` | TIMESTAMPTZ | When the workflow found it. Default `NOW()`. |
| `external_url` | TEXT | Deep link to the release / advisory / incident / page. |
| `source` | TEXT | Default `ecosystem_workflow`. Provenance. |
| `acknowledged_by` | UUID | FK → `team_members`. |
| `acknowledged_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated. |

**`payload` examples by `change_type`:**

```jsonc
// release
{ "old_version": "6.3.3", "new_version": "6.3.4", "tag": "v6.3.4",
  "published_at": "2026-07-12T02:00:00Z", "url": "https://github.com/Coldcard/firmware/releases/tag/v6.3.4" }

// advisory
{ "ghsa_id": "GHSA-xxxx-xxxx-xxxx", "cve_id": "CVE-2026-12345", "severity": "high",
  "affected_range": "< 2.1.0", "published_at": "2026-07-10T00:00:00Z", "url": "..." }

// staleness (detected by absence)
{ "metric": "proof_of_reserves", "last_event_at": "2025-06-06", "days_since": 401,
  "expected_cadence_days": 90, "days_overdue": 311 }

// discontinuity
{ "signal": "eol_notice", "detected_phrase": "will be discontinued", "effective_date": "2026-12-31", "url": "..." }

// policy_change
{ "page": "terms", "old_hash": "sha256:…", "new_hash": "sha256:…",
  "change_ratio": 0.14, "captured_at": "2026-07-03T09:00:00Z", "url": "..." }

// incident
{ "incident_id": "abc123", "impact": "major", "status": "investigating",
  "started_at": "2026-07-28T14:00:00Z", "url": "..." }

// pricing_change (policy_diff with content_kind: pricing)
{ "page": "pricing", "content_kind": "pricing", "old_hash": "sha256:…", "new_hash": "sha256:…",
  "change_ratio": 0.09, "captured_at": "2026-07-20T09:00:00Z", "url": "..." }

// regulatory_change (register status moved for the watched identifier)
{ "register": "austrac_dce", "identifier": "DCE100XXXXXX-001",
  "old_status": "registered", "new_status": "not_found", "observed_at": "2026-07-14", "url": "..." }

// corporate_event (elevated from an rss/news mention by keyword match)
{ "event_kind": "acquisition", "headline_terms": ["acquired", "acquires"],
  "source": "rss", "published_at": "2026-07-11T00:00:00Z", "url": "..." }
```

**Idempotency:** a unique index on `(watch_id, dedup_key)`. The detection step computes `dedup_key` and does an upsert-or-skip. Re-running the workflow, or overlapping runs, cannot create duplicate changes. This is the ecosystem equivalent of the Findings Engine persistence guard.

**The two-phase shape matters.** Phase A (detection) inserts the row with `payload`, `title`, `dedup_key`, `occurred_at`, `external_url` populated and `summary`/`materiality`/`compliance_class` NULL. Phase B (enrichment) fills the rest. If Phase B fails, the change is still captured with its verifiable facts and can be re-enriched. Facts never depend on the LLM being up.

-----

## Database Views

### `v_ecosystem_feed`

The main internal feed. Non-dismissed, non-archived changes with entity context, most material first, pinned on top.

```sql
CREATE VIEW v_ecosystem_feed AS
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
    COALESCE(ps.category, NULL) AS product_category,
    ap.type AS advisor_type,
    ch.product_service_id,
    ch.advisor_partner_id,
    w.label AS watch_label,
    w.watch_type,
    tm.full_name AS owner_name
  FROM ecosystem_changes ch
  JOIN ecosystem_watches w ON w.id = ch.watch_id
  LEFT JOIN products_services ps ON ps.id = ch.product_service_id
  LEFT JOIN advisors_partners ap ON ap.id = ch.advisor_partner_id
  LEFT JOIN team_members tm ON tm.id = w.owner_id
  WHERE ch.status NOT IN ('dismissed', 'archived')
  ORDER BY ch.pinned DESC, ch.materiality DESC NULLS LAST, ch.detected_at DESC;
```

### `v_ecosystem_watch_health`

Used by the watch-health surface and by Simon to notice a hub going quiet. A watch that has not checked in, or is failing, undermines trust more quietly than a missed change.

```sql
CREATE VIEW v_ecosystem_watch_health AS
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
  WHERE w.enabled = true
  ORDER BY
    CASE w.health WHEN 'failing' THEN 1 WHEN 'degraded' THEN 2 ELSE 3 END,
    w.last_checked_at ASC NULLS FIRST;
```

-----

## Agent Integration

### The ingestion workflow (Mastra Workflow, not Agent)

Detection is deterministic and wants to be testable, so it is a **Workflow**. Open-ended reasoning (scoring, narration, classification) is delegated to agent steps behind the deterministic wall. Verify all `@mastra/core` signatures against the installed package (currently `1.51.0`) before building — the workflow/step API has moved between minor versions.

Suggested schedule: **hourly** for `realtime`/`hourly` watches, **daily at 07:30 AEST** for the rest, ahead of Simon's morning compliance sweep.

**Phase A — detection (deterministic, always commits)**

1. Select due watches: `enabled = true` and `check_frequency` interval elapsed since `last_checked_at`.
1. For each watch, run the adapter step keyed off `watch_type`. Each adapter is a pure `(config, last_state, fetched) → (changes[], new_last_state)`.
1. For each candidate change, compute `dedup_key` and upsert into `ecosystem_changes` on `(watch_id, dedup_key)` — insert if new, skip if seen. Populate `payload`, `title`, `occurred_at`, `external_url`.
1. Update the watch: `last_state`, `last_checked_at`, `last_change_at` (if a change fired), reset `consecutive_failures` on success or increment + downgrade `health` on failure.
1. Log the run to `agent_activity` with `trigger_type: 'scheduled'`, `agent_name: 'ecosystem'`.

**Phase B — enrichment (agents, per new change)**

1. **Rex** scores `materiality` (0–100) from `change_type` × entity centrality × severity × recency, and derives the `severity` band. Deterministic-leaning rubric, documented and versioned.
1. **Narrator** writes `summary` under the payload-only narration contract — vocabulary restricted to keys present in `payload`. No "important", no "should", no numbers not in the payload.
1. **Lex** sets `compliance_class` and `compliance_notes`. For the internal feed Lex tags and does not suspend. A change touching valuation metrics, solvency, or anything advice-adjacent is classified accordingly so the client-promotion gate has what it needs later.

Because Phase A has already committed the facts, a Phase B failure leaves a valid, un-narrated change in the feed rather than losing it. Re-enrichment is a re-run over rows where `summary IS NULL`.

### Adapter notes (v1)

- **`regulatory_register`** (priority build) — status lookup for the watched entity's **exact identifier** against AUSTRAC's DCE register and ASIC's registers. `(register, identifier)` in config; the adapter resolves the single record, reads its status, and diffs against `last_state.status`. A transition (e.g. `registered → not_found`, or a status field changing) emits a `regulatory_change`. Where a register is not reliably machine-readable for an identifier, the adapter records that on the watch and does **not** emit — silence is safer than a false de-listing. Every emission is `solvency_adjacent` at minimum. Note AUSTRAC and ASIC domains are not on the container allow-list, so egress for this adapter runs from Railway, not the sandbox.
- **`github_release` / `github_advisory`** — GitHub REST: `/repos/{owner}/{repo}/releases` (or `/tags`) and `/repos/{owner}/{repo}/security-advisories`. Diff by release id / GHSA id against `last_state`. Unauthenticated rate limits are tight; use a token. `api.github.com` is already on the container allow-list.
- **`rss` / `newsletter` → `corporate_event`** — fetch, parse, diff by item guid + pubDate. Default `mention`, low materiality. A `config.event_terms` keyword match (acquired, raises, insolvent, resigns, enforcement, etc.) elevates the item to `corporate_event` with higher materiality. The same elevation applies to items surfaced by the existing Tavily/Jina research pipeline — the match is the mechanism, not the source.
- **`newsletter`** — no polling. A vendor newsletter is subscribed at `coldcard@feed.btsy.com.au`; the existing Fastmail catch-all → `news_sources` path delivers it, keyed on recipient local-part, and this workflow reads the ingested item. Near-zero new infrastructure — the email spine already exists.
- **`status_page`** — most vendors run Atlassian Statuspage (`/api/v2/incidents.json`) or Instatus. Diff by incident id and status transitions. `incident`-type changes.
- **`attestation`** — fetch the attestation page/endpoint, read the attestation date, compute `days_overdue` against `expected_cadence_days`. Emits a `staleness` change **when overdue** — a change detected by *absence*, phrased as neutral fact ("last attested N days ago; expected every M").
- **`policy_diff`** — fetch, extract `content_selector`, normalise, hash. On hash change above `min_change_ratio`, emit `policy_change` with old/new hashes and the change ratio. When `config.content_kind` is `pricing`, the same detection emits a `pricing_change` instead — one adapter, two change types. Storing the extracted text (not just the hash) lets a director see the actual diff; the narrator summarises *that a change occurred*, not whether it is favourable or a price rise versus a cut.

### Simon — optional digest (defer or thin)

Since changes auto-surface to the feed, a Signal digest is a convenience, not the primary channel. If included: a daily message listing changes above a materiality threshold not yet acknowledged, deduped against `agent_activity` so Simon does not repeat himself. Same digest pattern as the compliance sweep.

```
Ecosystem — 4 changes worth a look:

CRITICAL — Exchange Y: no longer listed on the AUSTRAC DCE register (observed 14 Jul)
CRITICAL — Electrum: security advisory GHSA-xxxx (affects < 2.1)
HIGH — Coldcard: firmware 6.3.4 released 12 Jul
MEDIUM — Custodian X: proof-of-reserves 401 days since last attestation

Open the Signals feed to review.
```

Note the register: Simon reports facts and points at the feed. He does not tell anyone to upgrade.

-----

## UI — Page Structure

The Ecosystem grouping in `Sidebar.tsx` currently spans `/products` and `/advisors`. Add a third child, **`/signals`**, and extend `isActive` so the grouping highlights on `/products`, `/advisors`, or `/signals`.

### `/signals` — the feed (new)

The first Ecosystem surface with search and filtering — which the register README flags as "the first thing that will hurt as the registers grow", so this is also where that pattern gets established.

- **List, not card grid.** A change feed reads better as a dense, scannable list ordered by the view. Each row: `change_type` chip, `entity_name`, `title`, the `summary` line, `occurred_at` (relative), a severity band, and a status control.
- **Filters:** entity, `change_type`, `severity`, `status`, and a "client-flagged" toggle. Default view hides `dismissed`/`archived`.
- **Version numbers, CVE ids, day counts** render in `JetBrains Mono`.
- **Colour discipline:** `severity` bands may use warning/destructive for `high`/`critical`; `change_type` is never coloured as positive; **no success-green on any change**; gold stays reserved for freshness/recency. This is the neutral-delta rule, verbatim.
- **Row actions:** acknowledge, dismiss, pin, add curator note, flag client-relevant. Flagging a non-`neutral` change surfaces a "requires compliance review" state (dormant gate; wired to Lex when the companion app ships).
- **Curator note** displays inline under the summary when present — the human annotation is first-class, not hidden in a modal.

### Product / advisor detail pages — new "What's changed" section

Mirror the existing section-card pattern (the interaction-history section is the template). On `/products/[id]` and `/advisors/[id]`:

- A **What's changed** card: the entity's recent `ecosystem_changes`, read-only, same neutral styling as the feed.
- A **Watches** card: the entity's `ecosystem_watches` with health dots, an "Add watch" ghost button (a `SlideOver` form with conditional fields per `watch_type`, following the referral-agreement/key-contact form conventions), and enable/disable + delete per row.

This keeps watch management where the entity lives, exactly as key contacts and referral agreements are managed on the detail page today — no writes to the register row itself, only to the new tables.

### Watch health

A lightweight surface reading `v_ecosystem_watch_health` — either a tab on `/signals` or `/signals/health`. Sort failing/degraded first. This is the "is the hub actually watching?" view; an unattended failing watch is a silent trust failure.

-----

## Server Actions

Follow the house pattern exactly (`parseForm` Zod → `getAuthedClient` → query with `humanizeError` → `revalidatePath` → `{ success }`), matching `apps/web/app/actions/products.ts`.

| Action | Effect |
|---|---|
| `createWatch(entityRef, …)` | Insert into `ecosystem_watches`. Revalidates the entity detail page. |
| `updateWatch(id, …)` | Update config/enabled/frequency. Revalidates entity + `/signals`. |
| `deleteWatch(id)` | Delete (cascades its changes). Revalidates entity + `/signals`. |
| `acknowledgeChange(id)` | Set `status = 'acknowledged'`, `acknowledged_by`, `acknowledged_at`. |
| `setChangeStatus(id, status)` | `dismissed` / `actioned` / `archived`. |
| `pinChange(id, pinned)` | Toggle `pinned`. |
| `setCuratorNote(id, note)` | Write `curator_note`. |
| `flagClientRelevant(id, flag)` | Set `client_relevant`; if `compliance_class <> 'neutral'`, route through the (future) Lex gate rather than setting directly. |

Conventions inherited from the register actions: checkboxes arrive as `'on'`; optional fields coerce with `|| null`; FK fields typed `z.string().uuid().optional().or(z.literal(''))`; `created_by` is create-only; edit forms call `router.refresh()` on success.

-----

## Indexes

```sql
CREATE INDEX idx_watches_product   ON ecosystem_watches(product_service_id);
CREATE INDEX idx_watches_advisor   ON ecosystem_watches(advisor_partner_id);
CREATE INDEX idx_watches_due       ON ecosystem_watches(enabled, check_frequency, last_checked_at);
CREATE INDEX idx_watches_health    ON ecosystem_watches(health);

CREATE UNIQUE INDEX uq_changes_dedup ON ecosystem_changes(watch_id, dedup_key);
CREATE INDEX idx_changes_product   ON ecosystem_changes(product_service_id);
CREATE INDEX idx_changes_advisor   ON ecosystem_changes(advisor_partner_id);
CREATE INDEX idx_changes_status    ON ecosystem_changes(status);
CREATE INDEX idx_changes_type      ON ecosystem_changes(change_type);
CREATE INDEX idx_changes_detected  ON ecosystem_changes(detected_at DESC);
CREATE INDEX idx_changes_client    ON ecosystem_changes(client_relevant) WHERE client_relevant = true;
```

-----

## RLS Policies

Platform default — authenticated users get full access.

```sql
ALTER TABLE ecosystem_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecosystem_watches_all" ON ecosystem_watches
  FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE ecosystem_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecosystem_changes_all" ON ecosystem_changes
  FOR ALL USING (auth.role() = 'authenticated');
```

When the companion app arrives, client visibility is a **new, narrower** policy over a `client_relevant = true AND compliance_class = 'neutral'` subset — not a loosening of these.

-----

## Migration & build notes

- One consolidated migration for both tables, their CHECKs, indexes, RLS, and the two views, plus the shared `update_updated_at` triggers.
- Run verification `SELECT`s as **separate** `execute_sql` calls — multiple statements in one call silently drop earlier result sets.
- Suggested three-session build, matching the house pattern (data layer → ingest workflow → surface): **Session 1** tables + views + watch CRUD on detail pages; **Session 2** the Mastra detection/enrichment workflow with the **`regulatory_register` adapter first** (the priority signal), plus the `newsletter` adapter (near-free on the existing email spine) to exercise a second shape; **Session 3** the `/signals` feed, filtering, the remaining adapters (`github`, `status_page`, `attestation`, `policy_diff` incl. pricing), and watch health.
- Build the `regulatory_register` adapter behind a hard precision test before it can emit: given a known-good identifier it must return the current status, and given a deliberately wrong identifier it must return "cannot determine" rather than "not found". A false de-listing is the one failure mode with real-world consequences.

-----

## Open Questions

- **Poll vs webhook for GitHub.** v1 polls (simple, no public endpoint). Webhooks would need a public Railway route and secret verification. Defer until polling volume or latency justifies it.
- **Regulatory register access.** AUSTRAC's DCE register and ASIC's registers vary in how machine-readable they are, and terms of use for automated access need checking per register. First cut can be a scheduled fetch-by-identifier + parse; confirm whether any offer a structured lookup before assuming HTML scraping. Entity matching is by exact identifier only — the open modelling decision is whether the AUSTRAC/ASIC number stays in watch `config` (v1 recommendation) or graduates to a first-class `regulatory_ref` column on `products_services` once the pattern proves out.
- **Status-page provider fragmentation.** Statuspage and Instatus cover most vendors, but not all. The adapter should degrade to the provider's RSS feed where no JSON API exists, and the config's `provider` field selects the parser. Some vendors will simply not be watchable this way — record that on the watch rather than pretending.
- **Policy-diff noise.** Pages change for trivial reasons (a footer year, a cookie banner). `min_change_ratio` plus content extraction reduces this, but calibration is empirical. Storing extracted text (not just the hash) lets a director judge; consider a materiality floor so trivial diffs land as `info` and stay out of the digest.
- **Materiality rubric ownership.** Rex's scoring rubric for the CFO lens needs a first cut and a versioning story, so a change in scoring is auditable. Where does entity "centrality" come from — a field on the register, or inferred from `australian_owned` / category / key-relationship? Recommend an explicit optional `centrality` weight on `ecosystem_watches` rather than inference.
- **Staleness scheduling.** A `staleness` change is detected by absence, so the attestation adapter must run on a clock even when nothing is fetched to diff. Confirm the daily schedule covers `attestation` watches regardless of `last_change_at`.
- **Watch check log.** `agent_activity` captures workflow runs, but a per-watch `ecosystem_watch_checks` row (timestamp, ok/fail, latency, note) would make "why didn't this fire?" answerable without log spelunking. Defer unless debugging pain appears — consistent with deferring `cpd_records` and `contract_signatories` until needed.
- **Client-promotion gate.** The dormant Lex suspend/resume on `flagClientRelevant` for non-`neutral` changes is specced but not built. It becomes the first real gate the day the companion app consumes this feed. Design the approval UI alongside that feature, not before.
- **Agent roster naming.** This spec references Rex (scoring), Lex (compliance), and Simon (digest). Confirm against the current `apps/agents` roster before wiring — the ecosystem README also names Della and Recorder, so the naming may have moved.
