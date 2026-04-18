# Schema Changes

Changelog of schema changes and design decisions.

Add an entry here whenever you create a new migration file. Format: date, what changed, why.

---

## 2026-04-17 — Discovery interviews foundation

Adds structured discovery interview tracking, pain point audit logging, stakeholder role tagging on contacts, and segment scorecards to support the 15–20 discovery interviews planned for Q2 validation.

- **`stakeholder_role` enum** — `CFO`, `CEO`, `HR`, `Treasury`, `PeopleOps`, `Other`. Applied to `contacts.role`.
- **`trigger_event_type` enum** — `FASB_CHANGE`, `EMPLOYEE_BTC_REQUEST`, `REGULATORY_UPDATE`, `OTHER`. Applied to `discovery_interviews.trigger_event`.
- **`contacts.role stakeholder_role`** — nullable column; existing contacts default to `NULL` (displayed as "Unassigned" in the portal).
- **`discovery_interviews`** — records each outreach or interview. Includes `status` (scheduled/completed/cancelled/no_show), `channel`, `pain_points TEXT[]`, `trigger_event`, and optional `email_thread_id` for future Fastmail thread linking. FK to `contacts` cascades on delete; FK to `companies` sets null on delete (preserving interview history if a company is removed).
- **`pain_point_log`** — audit trail for `pain_points` array changes. Populated by the `pain_points_audit` trigger, which guards against flooding on unrelated field updates (`NEW.pain_points IS DISTINCT FROM OLD.pain_points`).
- **`segment_scorecards`** — lightweight scorecard table: `need_score` and `access_score` (1–5 integers), `planned_interviews`, `notes`. Weighted score (`need × access`) is calculated client-side.
- All three new tables have RLS enabled (authenticated read/write), `updated_at` triggers, and appropriate indexes.

Migration: `20260417000000_add_discovery_interviews.sql`

---

## 2026-04-14 — Add source column to companies table

- **`companies.source`** — new nullable TEXT column with `DEFAULT 'manual'` and a CHECK constraint (`'manual'`, `'web'`, `'coordinator_agent'`, `'recorder_agent'`, `'call_transcript'`). The web UI (`apps/web/app/actions/companies.ts`) was inserting `source: 'web'` on every company creation, causing "Could not find the 'source' column of 'companies' in the schema cache" errors. Mirrors the pattern already established on `contacts.source`.

Migration: `20260414000000_add_source_to_companies.sql`

---

## 2026-04-01 — Fastmail watched_addresses filter

Added `watched_addresses TEXT[] NOT NULL DEFAULT '{}'` to `fastmail_accounts`.

When non-empty, the polling listener skips any email where none of the participants (From, To, Cc) match a watched address. This supports Fastmail accounts with multiple aliases where only specific addresses should be monitored. Empty array (the default) retains the original behaviour of logging all emails on the account.

Migration: `20260401130000_fastmail_watched_addresses.sql`

---

## 2026-04-01 — Fastmail JMAP email auto-logging

Three new tables plus extended source enums to support automatic email logging from Fastmail inboxes.

- **`fastmail_accounts`** — stores one row per team member Fastmail account (username, app-specific password token, display name, active flag). Managed via the web UI at `/settings/integrations/fastmail`. RLS allows `authenticated` and `service_role`.
- **`fastmail_exclusions`** — domains and email addresses to silently skip during sync (e.g. `stripe.com`, `noreply@example.com`). Type is `'domain'` or `'email'`. Managed via web UI.
- **`fastmail_sync_state`** — one row per `fastmail_accounts` row. Stores Fastmail's JMAP `queryState` for Inbox and Sent mailboxes to enable incremental sync (no re-processing old emails). Cascades on account deletion.
- **`contacts.source` extended** — `'fastmail_sync'` added to the check constraint. Contacts auto-created from email are tagged `['needs-review']` and have `pipeline_stage = 'lead'`.
- **`interactions.source` extended** — `'fastmail_sync'` added. Internal (team-to-team) emails land with `direction = 'internal'` and `contact_id = null`.
- **`platform_capabilities` seed** — `simon / fastmail_email_sync` row inserted.

Migration: `20260401120000_add_fastmail_sync.sql`

---

## 2026-03-30 — Fix agent_activity RLS, CHECK constraints, and workflow agent names

Three bugs that blocked all agent audit logging:

- **RLS missing `service_role`** — `agent_activity`, `platform_capabilities`, and `capacity_gaps` policies only allowed `auth.role() = 'authenticated'`. The Mastra server authenticates with the service role key, so every agent insert was rejected at the RLS layer. Policies now use `auth.role() IN ('authenticated', 'service_role')`, matching the pattern already set on `agent_conversations`.
- **`'della'` missing from CHECK constraints** — The `20260327000000_rename_agent_names` migration added `agent_activity_agent_name_check` and `platform_capabilities_agent_name_check` without including `'della'` (Relationship Manager). Her listener was writing `agent_name: 'della'`, causing every insert to fail with a constraint violation. Both constraints now include `'della'`.
- **Workflow agent_name mismatch (code fix)** — The Recorder workflow (`recorder/workflow.ts`) still wrote `'recorder'` and the PM workflow (`pm/workflow.ts`) still wrote `'pm'` — the pre-rename names. These were rejected by the CHECK constraints that require `'roger'` and `'petra'`. Fixed in TypeScript source; no additional schema migration needed.

Migration: `20260330000000_fix_agent_activity_rls_and_constraints.sql`

---

## 2026-03-29 — Add source_activity_id to tasks

- **`tasks.source_activity_id`** — new nullable FK column referencing `agent_activity(id)`. The PM workflow (`pmListener`) passes the `agent_activity.id` of the Simon dispatch row as `sourceActivityId` when creating tasks; the column was missing, causing every PM-triggered task creation to fail with "Could not find the 'source_activity_id' column". Note: `source_interaction_id` (FK to `interactions`) remains for tasks created from call/meeting interactions — these are semantically distinct audit links.
- **Index** — `idx_tasks_source_activity` added for efficient reverse-lookup.

---

## 2026-03-26 — Adopt Supabase CLI migration workflow with CI/CD auto-apply

- **Migration tooling adopted** — schema changes are now managed via the Supabase CLI. Migration files live in `supabase/migrations/` and are applied automatically on push to `main` via `.github/workflows/migrate.yml` (`supabase db push`). No manual SQL execution required.
- **Baseline migration** — `20260319000000_initial_schema.sql` captures the full schema as of the 2026-03-19 initial setup. Written idempotently (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE TRIGGER/VIEW`, `DROP POLICY IF EXISTS` + `CREATE POLICY`) so it can be safely applied to the existing live database.
- **Source-on-contacts migration** — `20260319000001_add_source_to_contacts.sql` records the `source` column addition as a discrete migration step (`ADD COLUMN IF NOT EXISTS` for idempotency against the baseline).
- **`schema.sql` role change** — `schema.sql` at the repo root is now a human-readable consolidated reference only. Do not execute it directly. The migration sequence in `supabase/migrations/` is the authoritative execution source of truth.
- **`supabase/seed.sql`** — the `platform_capabilities` INSERT block moved from `schema.sql` into `supabase/seed.sql`. Supabase CLI applies this automatically on `db reset` for local dev.
- **New scripts** — `db:migrate`, `db:diff`, `db:pull`, `db:reset` added to `packages/db/package.json` and mirrored at the root.
- **Developer workflow** — see `packages/db/MIGRATIONS.md` for the full day-to-day process.

---

## 2026-03-26 — Add research_monitors table for Researcher agent

- **`research_monitors` table** — stores scheduled research monitoring topics for the Researcher agent. Each monitor has a `subject`, an array of `search_queries` to run on each check, a `frequency` (daily/weekly/fortnightly), and a `last_digest` field storing a prose summary of the previous result for semantic change comparison. The `notify_signal` and `notify_agent` fields control how changes are surfaced. Supports the Researcher's `purpose: 'monitor'` workflow — a cron-triggered process queries due monitors, runs web searches, and compares current findings against the prior digest to detect material changes.
- **Partial index on `next_run_at`** — filtered `WHERE is_active = TRUE` so the hourly monitor check only scans active records.

---

## 2026-03-25 — Fix agent_conversations RLS policy for Supabase Realtime

- **`agent_conversations_all` policy** — added `'service_role'` to the `auth.role()` check. Standard Supabase API calls bypass RLS when using the `service_role` key, but `postgres_changes` Realtime subscriptions perform their own authorization check using the JWT claim. `auth.role()` returns `'service_role'` for that key, which the `= 'authenticated'`-only policy rejected — causing the Realtime subscription to hang silently until timeout and never reach `SUBSCRIBED`.

---

## 2026-03-19 — Initial schema

Consolidated schema established. Key design decisions:

- **`agent_activity` as universal audit trail** — every agent write operation logs here before touching the target table. Provides a tamper-evident record of all automated actions without relying on Postgres triggers.
- **`platform_capabilities` + `capacity_gaps`** — Simon uses these to track what the platform can and cannot do. `capacity_gaps` accumulates patterns of recurring capability shortfalls, informing what to build next.
- **`knowledge_items` with `VECTOR(1536)` + HNSW index** — uses pgvector for semantic search. Dimension matches OpenAI `text-embedding-3-small`. HNSW chosen over IVFFlat for lower query latency at the cost of higher build time (acceptable for this dataset size).
- **`knowledge_connections` graph edges** — separate table for entity relationships, traversed via recursive CTEs in `packages/db/src/rpc/`. Keeps the graph queryable without a dedicated graph DB.
- **`content_items` state machine** — `idea → draft → review → approved → published` enforced at application layer (not DB constraints) to allow agents to move items through the pipeline with human approval gates.
- **`requirements` with `user_stories` JSONB** — structured JSONB rather than a separate join table; the BA agent writes structured objects here during elicitation. Shape documented in `docs/agents/ba.md`.
- **`extracted_data` JSONB on several tables** — allows agents to store structured output without schema migrations during iteration. Shapes are documented per-agent in `docs/agents/`.
- **RLS: authenticated team members read/write everything** — two-person team, no row-level isolation needed between users. RLS is enabled (Supabase default) but policies grant full access to `authenticated` role.
