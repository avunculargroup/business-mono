# Feature Spec — Social Media Campaigns

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Campaign Strategy, Beat Planning, Multi-Account Content Generation, Compliance-Gated Publishing
**Status:** Draft
**Last updated:** 2026-06-04

-----

## Overview

The Social Media Campaigns feature is the strategic layer above the existing content pipeline. Where `content_items` holds individual posts, a **campaign** is the strategy container that gives a batch of posts a goal, a theme, a cadence, a target audience, and a set of accounts to post from.

A single campaign idea — say *“why volatility is not the same as risk on a treasury horizon”* — does not produce one post. It produces a **beat** (the platform-agnostic core message) that fans out into many **variants**: a LinkedIn long-form and an X thread, written in the company voice and again in each founder’s own voice. One beat can become six or more outputs. The feature’s entire job is to make that volume feel calm rather than overwhelming.

The architecture is three tiers:

1. **Campaigns** — the strategy, the global cadence config, the audience definition, the participating accounts.
1. **Campaign beats** — the ordered core ideas. Each beat is one message that gets adapted, not one post.
1. **Content items (variants)** — the actual platform-and-voice-specific posts that flow through the existing draft → approved → published pipeline, each linked back to its beat, account, and campaign.

Two Mastra workflows drive it. A **Campaign Strategy Workflow** synthesises the strategy and the beat plan, suspending twice for human approval. It then fans out, spawning one **Variant Generation Workflow** run per (beat × account) so each post has its own isolated run, its own compliance check, and its own approval gate.

Two new agents join the roster: **Margot (The Marketer)**, the strategist who sits above Charlie, and **Lex (The Compliance Officer)**, who classifies every post for financial-advice risk and decides whether a disclaimer is needed. Bruno and Rex are reachable as delegated branches within the workflows.

**Phase boundary.** Phase 1 ends at a *ready-to-post queue* — approved, scheduled, platform-conformant copy that a founder copies out and posts by hand, then marks as posted with the live URL. Phase 2 swaps the manual step for direct API execution and AI image generation. This spec covers Phase 1 in full and specs the data model so Phase 2 needs no destructive migration.

-----

## Scope

### In scope (Phase 1)

- Campaign creation: structured strategy, audience definition, account selection, global cadence config, duration in weeks
- Campaign beats: ordered core messages with per-account fan-out
- Per-account social account registry with per-account voice profiles (migrated from `brand-voice.md` into tables)
- Variant generation: platform-agnostic beats adapted into platform-conformant copy per account
- X threads as a first-class ordered child structure; single posts also supported
- Per-platform text conformance (X and LinkedIn character limits, enforced at generation and validated at save)
- Image upload to individual variants and individual thread segments, with alt text
- Compliance check per variant (advisory, not hard-blocking) with disclaimer auto-attachment above a threshold
- Three approval gates: strategy, plan, and per-variant — all in the web UI
- Ready-to-post queue for manual posting, with copy-out and mark-as-posted
- Manual, post-hoc metrics entry per published post
- Publish → embed → curator-notes learning loop feeding future campaign strategy
- Mastra workflows for strategy synthesis and variant generation
- Agent-readable views for campaign status, the content matrix, and the ready-to-post queue

### Out of scope (deferred to Phase 2 or later)

- Direct X / LinkedIn API posting → Phase 2
- AI-generated images via the agent server → Phase 2
- Signal-based approvals → deliberately UI-only in Phase 1
- Automatic post-time scheduling/dispatch → Phase 1 is manual posting at the planned slot
- Cross-account slot staggering and anti-duplication enforcement → Phase 2 (matters when posting is automated)
- Automatic metrics ingestion via platform APIs → Phase 2
- Paid/boosted post management, ad spend tracking
- Comment/DM monitoring and reply workflows
- Multi-party approval (both founders signing off) — single approver for now

-----

## User Stories

**As a founder, I need to:**

- Create a campaign with a clear objective, a target audience, the accounts it posts from, and how many weeks it runs
- Set a global cadence — which time slots posts go out (e.g. Tuesday morning) and how many posts per week
- Review and approve the campaign strategy before any content is generated
- Review and approve the beat plan and schedule before variants are written
- Review each generated variant individually, edit it, and approve or request a regeneration
- See, at a glance, where each post sits across accounts and platforms without drowning in a flat list of forty cards
- Upload an image to any post or thread segment, with alt text
- See a clear, calm signal when a post may constitute financial advice, and when a disclaimer has been auto-added
- Open a focused queue of posts that are ready to publish, copy the text out cleanly (segment-by-segment for threads), download the image, post manually, and mark it done with the live URL
- Record performance numbers for a published post without it feeling like a chore
- Have what worked on past campaigns inform the strategy of the next one
- Edit my own account’s voice profile in a friendly form without needing a redeploy

**As Simon (coordinator agent), I need to:**

- Hand a conversational campaign request off to Margot and surface her output for human review
- Know the status of any active campaign via `v_campaign_overview`
- (Phase 2) Alert on a campaign falling behind its planned cadence

**As Margot (marketing strategist), I need to:**

- Read the campaign objective, audience filter, and the publish → curator-notes history of prior campaigns to synthesise a structured strategy
- Branch to Rex for trend/competitor research and to Bruno for audience-pain-point analysis when a beat needs it
- Produce an ordered beat plan and a draft schedule across the configured slots
- Hand each beat to Charlie for per-account, per-platform copy

**As Charlie (content creator), I need to:**

- Read the strategy object, the target account’s voice profile, the company brand voice, and the platform spec, then write copy that conforms to the platform’s limits
- Produce ordered thread segments for X when the beat warrants a thread, or a single post when it does not

**As Lex (compliance officer), I need to:**

- Classify each variant as `educational`, `general_advice`, or `personal_opinion`
- Decide whether a disclaimer is needed and which keyed snippet applies
- Record my rationale and classification on the variant, and re-run when cleared copy is later edited

-----

## Data Model

### `social_accounts`

The destinations a campaign posts from, and the voice each one writes in. A founder posting on X and the same founder posting on LinkedIn are **separate rows** — same person, same beliefs, different voice and format.

|Column               |Type       |Notes                                                                   |
|---------------------|-----------|------------------------------------------------------------------------|
|`id`                 |UUID       |PK                                                                      |
|`platform`           |TEXT       |`linkedin`, `twitter_x` — matches `content_items.type` values           |
|`account_type`       |TEXT       |`company`, `founder`                                                    |
|`display_name`       |TEXT       |e.g. `BTS — Company`, `Chris (Founder)`                                 |
|`handle`             |TEXT       |@handle or profile slug                                                 |
|`profile_url`        |TEXT       |                                                                        |
|`team_member_id`     |UUID       |FK → `team_members`. NULL for company accounts, set for founder accounts|
|`voice_profile`      |JSONB      |Per-account voice (see shape below)                                     |
|`is_active`          |BOOLEAN    |Default `true`                                                          |
|`api_credentials_ref`|TEXT       |Phase 2 — reference/key into the secret store, never the secret itself  |
|`created_by`         |UUID       |FK → `team_members`                                                     |
|`created_at`         |TIMESTAMPTZ|                                                                        |
|`updated_at`         |TIMESTAMPTZ|Auto-updated                                                            |

**`voice_profile` shape:**

```json
{
  "persona": "A measured, credible operator who has actually sat in a CFO seat.",
  "tone_attributes": ["plain-spoken", "calm", "authoritative without hype"],
  "vocabulary_do": ["treasury horizon", "balance sheet", "allocation"],
  "vocabulary_avoid": ["HODL", "to the moon", "rocket emojis", "diamond hands"],
  "signature_devices": ["opens with a concrete number", "ends with a question"],
  "format_notes": "X: punchy, one idea per segment. LinkedIn: longer-form, deliberate line breaks."
}
```

Exemplar phrases and posts for a voice are **not** stored here — they live in the embeddable `voice_snippets` table (see `brand-voice-migration-spec.md`), so agents can retrieve the ones semantically closest to a given beat.

**Voice migration note:** Company brand voice currently lives in `docs/brand-voice.md`. As decided, all voice moves into tables. Company brand voice migrates into a singleton `brand_voice` row (same enforcement pattern as `company_profile` — application-layer singleton). Each `social_accounts.voice_profile` is the **account-specific application or override** of that company canon. Margot and Charlie read the company `brand_voice` as the umbrella and the account `voice_profile` as the specific. `docs/brand-voice.md` is retired once migrated; `CLAUDE.md`’s source-of-truth boundary table should be updated to point voice queries at the table, not the doc. (See Open Questions.)

-----

### `campaigns`

The strategy container and global configuration. The `strategy` object **locks** once the plan is approved — major pivots require a new campaign.

|Column                |Type       |Notes                                                                                     |
|----------------------|-----------|------------------------------------------------------------------------------------------|
|`id`                  |UUID       |PK                                                                                        |
|`name`                |TEXT       |                                                                                          |
|`objective`           |TEXT       |Plain-language goal of the campaign                                                       |
|`status`              |TEXT       |`draft`, `strategy_approved`, `plan_approved`, `active`, `paused`, `completed`, `archived`|
|`strategy`            |JSONB      |Structured strategy object (see shape). Locked after `plan_approved`                      |
|`audience_filter`     |JSONB      |Structured CRM-aware filter conditioning the copy (see shape)                             |
|`audience_persona`    |TEXT       |Prose persona layer that complements the structured filter                                |
|`start_date`          |DATE       |First posting day                                                                         |
|`duration_weeks`      |INT        |Founder-set campaign length                                                               |
|`posts_per_week`      |INT        |Global cadence — number of posts per week                                                 |
|`post_slots`          |JSONB      |Named time slots (see shape)                                                              |
|`timezone`            |TEXT       |Default `Australia/Melbourne`                                                             |
|`strategy_approved_at`|TIMESTAMPTZ|                                                                                          |
|`strategy_approved_by`|UUID       |FK → `team_members`                                                                       |
|`plan_approved_at`    |TIMESTAMPTZ|                                                                                          |
|`plan_approved_by`    |UUID       |FK → `team_members`                                                                       |
|`created_by`          |UUID       |FK → `team_members`                                                                       |
|`created_at`          |TIMESTAMPTZ|                                                                                          |
|`updated_at`          |TIMESTAMPTZ|Auto-updated                                                                              |

**`strategy` shape:**

```json
{
  "content_pillars": ["Treasury risk reframed", "AU regulatory clarity", "Operational how-to"],
  "key_messages": ["Volatility is not risk on a multi-year horizon", "..."],
  "audience_summary": "AU CFOs and finance leads at asset managers and family offices, intermediate+ literacy.",
  "tone_guidance": "Credible, calm, never speculative. Explain jargon when used.",
  "hooks": ["Open with a balance-sheet number", "..."],
  "hashtags": ["#corporatetreasury", "#bitcoin"],
  "do_not_say": ["price predictions", "guaranteed returns", "personal advice framing"],
  "success_signals": ["inbound DMs from finance leaders", "profile visits from target firms"]
}
```

**`audience_filter` shape** — conditions the copy; it is **not** a recipient list (social is broadcast):

```json
{
  "industry": ["Asset Management", "Family Office"],
  "pipeline_stage": ["warm", "active"],
  "bitcoin_literacy_min": "intermediate"
}
```

**`post_slots` shape:**

```json
{
  "slots": [
    { "day": "TU", "time": "09:00", "label": "Tuesday morning" },
    { "day": "TH", "time": "09:00", "label": "Thursday morning" }
  ]
}
```

`posts_per_week` and `post_slots` together drive scheduling. In Phase 1 the slot is a *planning target* a founder posts to manually; precise dispatch is Phase 2. Whether `posts_per_week` is per-account or total across accounts is an Open Question — Phase 1 treats it as a total, with the scheduler distributing across participating accounts.

**Campaign lifecycle:**

```
draft → strategy_approved → plan_approved → active → completed → archived
                                              ↕
                                            paused
```

`completed` fires when the end date is reached (`start_date + duration_weeks`) regardless of whether every post shipped — a campaign that ran its course is complete even if a beat was skipped. `archived` is manual.

-----

### `campaign_accounts`

Join table — which accounts participate in a campaign. Each beat fans out to every participating account by default.

|Column             |Type|Notes                               |
|-------------------|----|------------------------------------|
|`campaign_id`      |UUID|FK → `campaigns` ON DELETE CASCADE  |
|`social_account_id`|UUID|FK → `social_accounts`              |
|PRIMARY KEY        |    |(`campaign_id`, `social_account_id`)|

-----

### `campaign_beats`

The ordered core ideas. A beat is the **platform-agnostic message**, persisted so a single platform’s variant can be regenerated without losing its siblings.

|Column         |Type       |Notes                                                         |
|---------------|-----------|--------------------------------------------------------------|
|`id`           |UUID       |PK                                                            |
|`campaign_id`  |UUID       |FK → `campaigns` ON DELETE CASCADE                            |
|`sequence`     |INT        |Order within the campaign                                     |
|`title`        |TEXT       |Short internal name for the beat                              |
|`core_message` |TEXT       |The platform-agnostic idea — the thing every variant expresses|
|`rationale`    |TEXT       |Why this beat exists, what it is meant to achieve             |
|`prefer_thread`|BOOLEAN    |Hint from strategy: does this beat warrant an X thread?       |
|`status`       |TEXT       |`planned`, `generating`, `variants_ready`, `complete`         |
|`created_at`   |TIMESTAMPTZ|                                                              |
|`updated_at`   |TIMESTAMPTZ|Auto-updated                                                  |

Beat status is a light roll-up convenience; the authoritative state lives on the variant rows. Per-beat account targeting overrides (a beat that should skip one account) are an Open Question — default is fan-out to all participating accounts.

-----

### `content_items` (extended)

The existing `content_items` table is **reused** as the variant. New columns are added to link a variant to its campaign, beat, and account, and to carry thread, compliance, and approval state. Existing columns (`title`, `body`, `type`, `status`, `topic_tags`, `scheduled_for`, `published_at`, `published_url`, `assigned_to`, etc.) are unchanged.

**New / changed columns:**

|Column                     |Type       |Notes                                                               |
|---------------------------|-----------|--------------------------------------------------------------------|
|`campaign_id`              |UUID       |FK → `campaigns` ON DELETE SET NULL. NULL for non-campaign posts    |
|`beat_id`                  |UUID       |FK → `campaign_beats` ON DELETE SET NULL                            |
|`social_account_id`        |UUID       |FK → `social_accounts` — the destination this variant is written for|
|`is_thread`                |BOOLEAN    |Default `false`. `true` → segments live in `thread_segments`        |
|`char_count`               |INT        |Cached length for single posts; validated against `platform_specs`  |
|`compliance_status`        |TEXT       |`pending`, `cleared`, `flagged`, `overridden`                       |
|`compliance_classification`|TEXT       |`educational`, `general_advice`, `personal_opinion`                 |
|`needs_disclaimer`         |BOOLEAN    |Lex’s decision                                                      |
|`disclaimer_snippet_id`    |UUID       |FK → `compliance_snippets` — which disclaimer was attached          |
|`compliance_rationale`     |TEXT       |Lex’s reasoning, surfaced on demand in the UI                       |
|`compliance_checked_at`    |TIMESTAMPTZ|Set on each Lex run; cleared/reset when copy is edited              |
|`compliance_overridden_by` |UUID       |FK → `team_members` — human override of a `flagged` verdict, logged |
|`approved_by`              |UUID       |FK → `team_members` — per-variant approval                          |
|`approved_at`              |TIMESTAMPTZ|                                                                    |

**Existing `source` CHECK must be extended** from `('manual', 'coordinator_agent', 'content_agent')` to also include `'margot'` and `'charlie'`. Existing `type` CHECK already includes `linkedin` and `twitter_x`. Existing `status` machine (`idea → draft → review → approved → scheduled → published → archived`) is reused for variants.

**Thread bodies:** For a single post, `body` holds the full copy. For a thread (`is_thread = true`), `body` is optional summary/first-line context and the authoritative content is the ordered rows in `thread_segments`.

-----

### `thread_segments`

Ordered child rows of a threaded `content_item`. First-class so threads can be reordered, edited per segment, and embedded on publish.

|Column           |Type       |Notes                                       |
|-----------------|-----------|--------------------------------------------|
|`id`             |UUID       |PK                                          |
|`content_item_id`|UUID       |FK → `content_items` ON DELETE CASCADE      |
|`sequence`       |INT        |1-based order in the thread                 |
|`body`           |TEXT       |The segment copy                            |
|`char_count`     |INT        |Validated against `platform_specs.max_chars`|
|`created_at`     |TIMESTAMPTZ|                                            |
|`updated_at`     |TIMESTAMPTZ|Auto-updated                                |

`UNIQUE (content_item_id, sequence)`.

-----

### `content_images`

Images attach at the **variant level** — and, for threads, optionally at the **segment level** (multi-image threads are a real tactic). Same upload can be reused across variants by the application layer; each row carries its own alt text.

|Column             |Type       |Notes                                                                |
|-------------------|-----------|---------------------------------------------------------------------|
|`id`               |UUID       |PK                                                                   |
|`content_item_id`  |UUID       |FK → `content_items` ON DELETE CASCADE — always set                  |
|`thread_segment_id`|UUID       |FK → `thread_segments` ON DELETE CASCADE — NULL = applies to the post|
|`storage_path`     |TEXT       |Path in the private Supabase bucket (via `packages/storage`)         |
|`alt_text`         |TEXT       |Accessibility, and it reads as more credible                         |
|`platform_crop`    |TEXT       |e.g. `linkedin_1200x627`, `x_16_9` — the intended crop               |
|`sort_order`       |INT        |Order when a post carries multiple images                            |
|`source`           |TEXT       |`upload` (Phase 1), `ai_generated` (Phase 2). Default `upload`       |
|`created_by`       |UUID       |FK → `team_members`                                                  |
|`created_at`       |TIMESTAMPTZ|                                                                     |

Images live in the single private Supabase bucket with folder-based organisation, consistent with the File Storage feature; agents reach signed URLs through `packages/storage`, never raw.

-----

### `platform_specs`

Editable config so a platform changing its limits is a row edit, not a code change.

|Column               |Type       |Notes                                           |
|---------------------|-----------|------------------------------------------------|
|`id`                 |UUID       |PK                                              |
|`platform`           |TEXT       |`linkedin`, `twitter_x` — UNIQUE                |
|`max_chars`          |INT        |Safe base limit (e.g. X ~280, LinkedIn ~3000)   |
|`premium_max_chars`  |INT        |X Premium long-form (e.g. 25000). NULL where N/A|
|`max_thread_segments`|INT        |NULL for LinkedIn                               |
|`max_images_per_post`|INT        |                                                |
|`image_specs`        |JSONB      |Recommended dimensions / ratios per placement   |
|`hashtag_guidance`   |TEXT       |Conventions Charlie should follow               |
|`notes`              |TEXT       |                                                |
|`updated_at`         |TIMESTAMPTZ|Auto-updated                                    |

Conformance is enforced at **two points**: at generation (Charlie writes to `max_chars` via the prompt) and at save (soft warning approaching the limit, hard reject above it). X Premium long-form is treated as an account-level capability — Phase 1 writes to the safe `max_chars` unless an account is flagged premium. (See Open Questions.)

-----

### `compliance_snippets`

Keyed, versioned, reusable disclaimers. Lex selects one by `key`. Reusable across Social, Contracts, and Compliance features — so disclaimers live in one place, not scattered as fields.

|Column      |Type       |Notes                                                       |
|------------|-----------|------------------------------------------------------------|
|`id`        |UUID       |PK                                                          |
|`key`       |TEXT       |UNIQUE — e.g. `general_advice_warning`, `no_personal_advice`|
|`label`     |TEXT       |Human-friendly name                                         |
|`body`      |TEXT       |Disclaimer text (markdown)                                  |
|`version`   |TEXT       |Semver-style                                                |
|`is_active` |BOOLEAN    |Default `true`                                              |
|`applies_to`|TEXT[]     |e.g. `['social', 'contract', 'compliance']`                 |
|`created_by`|UUID       |FK → `team_members`                                         |
|`created_at`|TIMESTAMPTZ|                                                            |
|`updated_at`|TIMESTAMPTZ|Auto-updated                                                |

-----

### `post_metrics`

Manual, post-hoc performance numbers. One row per published variant, updated in place. A few common columns plus a platform-flexible JSONB; no snapshots.

|Column           |Type       |Notes                                                       |
|-----------------|-----------|------------------------------------------------------------|
|`id`             |UUID       |PK                                                          |
|`content_item_id`|UUID       |FK → `content_items` ON DELETE CASCADE — UNIQUE             |
|`platform`       |TEXT       |Denormalised for querying                                   |
|`impressions`    |INT        |                                                            |
|`reactions`      |INT        |LinkedIn reactions / X likes                                |
|`comments`       |INT        |Replies                                                     |
|`reposts`        |INT        |Reshares / retweets                                         |
|`clicks`         |INT        |Link or profile clicks                                      |
|`extra`          |JSONB      |Platform-specific extras (X bookmarks, LinkedIn dwell, etc.)|
|`recorded_at`    |TIMESTAMPTZ|                                                            |
|`recorded_by`    |UUID       |FK → `team_members`                                         |

-----

## Database Views

### `v_campaign_overview`

Powers the campaigns list and Simon’s status queries — progress and timeline per campaign.

```sql
CREATE VIEW v_campaign_overview AS
  SELECT
    c.id,
    c.name,
    c.objective,
    c.status,
    c.start_date,
    c.duration_weeks,
    (c.start_date + (c.duration_weeks * 7)) AS end_date,
    ((c.start_date + (c.duration_weeks * 7)) - CURRENT_DATE) AS days_remaining,
    COUNT(ci.id)                                        AS total_variants,
    COUNT(ci.id) FILTER (WHERE ci.status = 'published') AS published_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'approved')  AS approved_count,
    COUNT(ci.id) FILTER (WHERE ci.status IN ('draft','review')) AS pending_count,
    COUNT(ci.id) FILTER (WHERE ci.compliance_status = 'flagged') AS flagged_count
  FROM campaigns c
  LEFT JOIN content_items ci ON ci.campaign_id = c.id
  GROUP BY c.id
  ORDER BY c.start_date DESC;
```

### `v_campaign_matrix`

The signature view — every variant with its beat, account, platform, slot, status, and compliance state. Feeds the desktop calendar/grid and the mobile agenda list (same data, different layout).

```sql
CREATE VIEW v_campaign_matrix AS
  SELECT
    ci.id,
    ci.campaign_id,
    ci.beat_id,
    cb.sequence       AS beat_sequence,
    cb.title          AS beat_title,
    sa.id             AS account_id,
    sa.display_name   AS account_name,
    sa.platform,
    ci.type,
    ci.is_thread,
    ci.status,
    ci.scheduled_for,
    ci.compliance_status,
    ci.compliance_classification,
    ci.needs_disclaimer,
    ci.char_count
  FROM content_items ci
  JOIN campaign_beats cb ON cb.id = ci.beat_id
  JOIN social_accounts sa ON sa.id = ci.social_account_id
  WHERE ci.campaign_id IS NOT NULL
  ORDER BY cb.sequence ASC, sa.display_name ASC;
```

### `v_ready_to_post`

Phase 1’s payoff — approved, scheduled variants due to be posted, with everything a founder needs to copy out by hand.

```sql
CREATE VIEW v_ready_to_post AS
  SELECT
    ci.id,
    ci.campaign_id,
    ci.title,
    ci.body,
    ci.type,
    ci.is_thread,
    ci.scheduled_for,
    sa.display_name AS account_name,
    sa.platform,
    sa.profile_url,
    cs.body         AS disclaimer_text
  FROM content_items ci
  JOIN social_accounts sa ON sa.id = ci.social_account_id
  LEFT JOIN compliance_snippets cs ON cs.id = ci.disclaimer_snippet_id
  WHERE ci.status = 'approved'
    AND ci.campaign_id IS NOT NULL
  ORDER BY ci.scheduled_for ASC NULLS LAST;
```

Thread segments and images are fetched per row by the application layer (a view can’t cleanly nest the ordered children).

-----

## Workflow Design (Mastra)

> **Implementation note for Claude Code:** The primitives below — suspend/resume, nested/child workflow invocation, and iteration over a collection — change between Mastra versions. Before writing any of this, verify the current API against the installed package’s embedded docs (`node_modules/@mastra/core/dist/docs/`) per the `mastra` skill and `CLAUDE.md`. Treat the names below as *intent*, not signatures. This follows the spec-first / verify-API principle already established in the project.

Two workflows. Margot is embedded as an agent **inside** the strategy workflow’s reasoning steps, and also exists as a **standalone agent** Simon can delegate to conversationally (“Margot, rethink the angle on beat 3”). Bruno and Rex are reached as **workflow branches**, not as Margot’s tools.

### Campaign Strategy Workflow

Input: `objective`, `audience_filter`, `audience_persona`, participating `account_ids`, `post_slots`, `posts_per_week`, `duration_weeks`, `start_date`.

1. **(Optional branch) Rex — research.** If the objective benefits from current context, branch to Rex for trend/competitor research. Output feeds the strategy step.
1. **(Optional branch) Bruno — audience analysis.** Branch to Bruno to characterise audience pain points from the CRM segment matched by `audience_filter`.
1. **Margot — strategy synthesis.** Margot reads the objective, audience, prior-campaign learnings (published posts + `curator_notes` + `post_metrics`), and any research, and emits the structured `strategy` object.
1. **SUSPEND — strategy gate.** Human reviews and approves/edits the strategy in the UI. On resume, persist `strategy`, set `status = strategy_approved`.
1. **Margot — beat plan + schedule.** Margot produces ordered `campaign_beats` and distributes (beat × account) variants across `post_slots` over `duration_weeks`, respecting `posts_per_week`. Writes draft `scheduled_for` per intended variant.
1. **SUSPEND — plan gate.** Human reviews the beat plan and the calendar. On resume, **lock `strategy`**, set `status = plan_approved`, persist beats.
1. **Fan out.** For each (beat × participating account), spawn one **Variant Generation Workflow** run. Each run gets its own `workflow_run_id` logged to `agent_activity` — isolated retries, isolated approval, clean provenance.

### Variant Generation Workflow (one run per variant)

Input: `beat_id`, `social_account_id`, `campaign_id`.

1. **Resolve context.** Determine platform from the account. Load the account `voice_profile`, the company `brand_voice`, the relevant `platform_specs`, and the campaign `strategy`.
1. **(Optional branch) Bruno.** For a beat needing deeper framing, branch to Bruno for delegated analysis.
1. **Charlie — generate copy.** Charlie writes platform-conformant copy in the account’s voice, to the strategy. If `beat.prefer_thread` and platform is `twitter_x`, Charlie emits ordered segments; otherwise a single post. Char limits from `platform_specs` are honoured at generation.
1. **Lex — compliance check.** Lex classifies the copy (`educational` / `general_advice` / `personal_opinion`), decides `needs_disclaimer`, selects the `compliance_snippets` key if so, and records `compliance_rationale`. Lex is **advisory** — she never hard-blocks.
1. **Persist.** Write the `content_item` (and `thread_segments` if threaded) with `status = draft`, `source = 'charlie'`, compliance fields populated, `disclaimer_snippet_id` set where attached.
1. **SUSPEND — per-variant approval gate.** Human approves, edits, or requests regeneration in the UI.
- **Approve** → `status = approved`, `approved_by/at` set.
- **Request change** → regenerate **this variant only** (the single-variant regeneration unit), re-running Charlie → Lex.

### Compliance re-run on edit

When a human edits copy that was already `cleared`, the application layer (not the workflow) re-invokes Lex and resets `compliance_status`/`compliance_checked_at`. An edit can reintroduce advice risk, so a clear verdict does not survive an edit.

### Logging

Every Margot, Charlie, Bruno, Rex, and Lex action logs to `agent_activity` with `trigger_type = 'manual'` or `'scheduled'`, the `workflow_run_id`, and proposed/approved status — consistent with the existing audit-trail pattern.

-----

## Agent Integration

### Margot (The Marketer) — strategy and creative direction

The new strategist above Charlie. Owns the `strategy` object and the beat plan. Reads prior-campaign learnings so each campaign starts smarter than the last. Embedded in the strategy workflow and available to Simon as a standalone delegate. Delegates research to Rex and audience analysis to Bruno via workflow branches.

### Charlie (Content Creator) — platform copy

Unchanged in role, now downstream of Margot. Writes per-account, per-platform copy to the strategy and the account voice, conforming to `platform_specs`. Produces threads or single posts.

### Lex (The Compliance Officer) — advice-risk classification

New agent. Runs per variant. Classifies, decides on disclaimers, records rationale. Advisory only — flags and suggests, humans decide, overrides are logged. Reusable conceptually wherever advice risk appears (the `compliance_snippets` store is shared with Contracts/Compliance).

### Bruno (The BA) — delegated analysis

Reached as a workflow branch for audience pain-point analysis and beat framing. Not the campaign owner.

### Rex (The Researcher) — trends and competitors

Reached as a workflow branch for current context feeding strategy synthesis.

### Simon (Orchestrator/EA)

In Phase 1, surfaces **nothing over Signal** for campaigns — all approvals are UI-only. Simon’s role is conversational orchestration: handing a campaign request to Margot and surfacing her output. Phase 2 may add Signal nudges for cadence drift.

-----

## UI — Page Structure

### `/campaigns` — top-level section

**Tabs:**

- **Campaigns** — list of all campaigns with progress and timeline
- **Accounts** — the `social_accounts` registry and per-account voice editing (or surfaced under Brand Hub — see below)

The whole feature must be **mobile-friendly**. Chris works on the go; approvals and the ready-to-post flow have to work on a phone.

### Campaign creation — wizard, then editable canvas

First creation is a guided **wizard** using the existing step-indicator aesthetic (gold active step, success-green completed):

1. **Objective & audience** — name, objective, audience filter builder (industry, pipeline stage, literacy ≥), prose persona
1. **Accounts & cadence** — pick participating accounts, set `posts_per_week`, choose `post_slots`, set `duration_weeks` and `start_date`
1. **Strategy review** — Margot’s `strategy` object, editable, then **approve (strategy gate)**
1. **Plan review** — the beat plan and the calendar, editable, then **approve (plan gate)**

After creation, the campaign opens as an **editable canvas** — the strategy, plan, and calendar become panels you edit in place rather than re-walking the wizard. On mobile the canvas reflows to a single column; the wizard is already linear and stacks naturally.

### Campaign detail — the hero

Opening a single campaign greets you with, in order:

1. **Strategy summary** pinned at the top — you never lose the *why*
1. **Progress** — published / total, with the **coming-up posts** beneath it when the campaign is not yet complete

### Visualising the matrix

The **calendar is the hero** on desktop: slots laid across the campaign weeks, each post a chip with a status dot, showing the *rhythm* of the campaign. A **grid toggle** (beats as rows, accounts as columns) shows *coverage* — which beats or accounts are thin. On **mobile**, the calendar gives way to an **agenda list** (the same `v_campaign_matrix` data, chronological) because a week × accounts grid does not fit a phone.

### Variant editor — the most-used screen

Layout: editor on the left, a **platform-accurate preview on the right** that mimics real X / LinkedIn post chrome so you see roughly what ships. On mobile these **stack**, preview below editor.

- Live **character counter** that shifts gold → warning → destructive as it approaches the `platform_specs` limit
- **Lex’s compliance verdict** as a calm chip (see below)
- The resolved **account voice** shown for context
- **Image slot** with alt-text field
- **Inline approve / request-change** buttons — no separate queue; approval happens where the work is

### Threads in the editor

A thread renders as a **vertical stack of connected cards** with **drag handles** to reorder — the actual shape of a thread. Each segment is **numbered (1/, 2/, 3/)** like X, has its **own character counter**, and its **own optional image slot**. Add/remove segments inline.

### Lex’s verdict, visually

Advisory means the *visual weight* is the whole UX. A loud red banner trains people to ignore it; a buried note defeats the purpose. So: a small **compliance chip**, calm by default, that **expands to Lex’s rationale on click**.

- `educational` → quiet all-clear (subtle success tint)
- `general_advice` → warning-toned chip; disclaimer auto-attached
- `personal_opinion` → a flagged chip inviting your judgement; override is logged

When a disclaimer is auto-appended, it is **visibly distinct in the preview** — greyed and tagged *“auto-added by Lex”* — so you always know it wasn’t your copy.

### Ready-to-post queue

Phase 1’s actual payoff. A focused, per-post view:

- The exact **scheduled slot** and target **account**
- A big **Copy text** button — and for threads, **copy segment-by-segment** (X’s composer takes them one at a time)
- **Download image** with its alt text shown
- The attached disclaimer, clearly marked
- **Mark as posted** → prompts for the **live URL**, which writes `published_url` and advances `status` to `published`

Frictionless copy-out is what makes this get used twice.

### Audience & voice editing — friendly forms

Voice profiles live in **Brand Hub** (its natural home), edited via a **friendly form** — tone chips, do/avoid lists, and a snippets panel of exemplars (backed by `voice_snippets`) — never raw JSON, because founders editing JSON is how voices quietly break. The audience filter builder lives inside the campaign creation flow.

### Metrics entry

Manual metrics die if entry is tedious. So: a **compact inline row** on each published post with **platform-aware fields** (X: impressions, likes, replies, reposts, bookmarks; LinkedIn: impressions, reactions, comments, reposts, clicks). Published posts then **visibly carry their numbers**, so the campaign view shows what landed at a glance.

-----

## Indexes

```sql
CREATE INDEX idx_social_accounts_platform   ON social_accounts(platform);
CREATE INDEX idx_social_accounts_member     ON social_accounts(team_member_id);

CREATE INDEX idx_campaigns_status           ON campaigns(status);
CREATE INDEX idx_campaigns_start            ON campaigns(start_date);

CREATE INDEX idx_campaign_beats_campaign    ON campaign_beats(campaign_id);

CREATE INDEX idx_content_items_campaign     ON content_items(campaign_id);
CREATE INDEX idx_content_items_beat         ON content_items(beat_id);
CREATE INDEX idx_content_items_account      ON content_items(social_account_id);
CREATE INDEX idx_content_items_compliance   ON content_items(compliance_status);

CREATE INDEX idx_thread_segments_item       ON thread_segments(content_item_id);
CREATE INDEX idx_content_images_item        ON content_images(content_item_id);
CREATE INDEX idx_content_images_segment     ON content_images(thread_segment_id);

CREATE INDEX idx_post_metrics_item          ON post_metrics(content_item_id);
CREATE INDEX idx_campaign_accounts_campaign ON campaign_accounts(campaign_id);
```

-----

## RLS Policies

Consistent with the existing two-founder model — authenticated team members read and write everything.

```sql
ALTER TABLE social_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_beats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_segments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_specs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_accounts_all"     ON social_accounts     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "campaigns_all"           ON campaigns           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "campaign_accounts_all"   ON campaign_accounts   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "campaign_beats_all"      ON campaign_beats      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "thread_segments_all"     ON thread_segments     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "content_images_all"      ON content_images      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "platform_specs_all"      ON platform_specs      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "compliance_snippets_all" ON compliance_snippets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "post_metrics_all"        ON post_metrics        FOR ALL USING (auth.role() = 'authenticated');
```

-----

## Open Questions

- **`brand-voice.md` migration:** Migrating company brand voice into a `brand_voice` table retires a canonical doc. Confirm the table shape mirrors the per-account `voice_profile` schema, and update `CLAUDE.md`’s source-of-truth boundary table so voice queries route to the table. Worth doing as a small dedicated migration before this feature, not buried inside it.
- **`posts_per_week`: per-account or total?** Phase 1 treats it as a total distributed across accounts. If founders think in per-account cadence (“each founder posts twice a week”), the field becomes per-account and the scheduler multiplies. Decide before the scheduling step is built.
- **Cross-account anti-duplication / staggering:** When one beat hits the company account and both founders, near-identical posts landing together looks like a bot farm. Phase 1 sidesteps this (manual posting, founders space it naturally). Phase 2 must enforce genuinely different copy per voice and staggered slots.
- **Phase 2 API mechanism — the LinkedIn problem:** X’s API for posting is workable; **LinkedIn’s API for posting to *personal* profiles is heavily gated** (company-page posting is far easier than posting on behalf of an individual, which is a partner-approval process). The founder-account requirement may force a different mechanism for personal LinkedIn than for everything else. Verify the current state of both APIs at Phase 2 kickoff — do not assume training-data-era access still holds.
- **AI image generation (Phase 2):** `content_images.source = 'ai_generated'` is reserved. Decide the generation path (agent-server-hosted model vs external API) and how brand and visual-system constraints — sourced from the **BTS design skill** (the visual canon), not the legacy markdown brief — are injected into prompts.
- **X Premium long-form:** Modelled as an account capability flag. Phase 1 writes to the safe `max_chars`. If a founder account is verified premium and wants long-form, add an `is_premium`/`supports_long_form` flag to `social_accounts`.
- **Per-beat account targeting:** Default is fan-out to all participating accounts. If a beat should skip an account (e.g. too founder-personal for the company page), a `campaign_beat_accounts` join or an exclude array on the beat is needed. Defer until the need appears.
- **Metrics depth:** One latest row per post, no snapshots. If trajectory (24h vs 7d) becomes useful for the learning loop, relax the UNIQUE constraint and add a `recorded_at`-keyed history. Deferred.
- **Campaign versioning:** Strategy locks after plan approval; major pivots require a new campaign. If “fork this campaign with a tweaked strategy” becomes common, a `parent_campaign_id` lineage column is the lightweight answer. Defer.