# Schema Changes

Changelog of schema changes and design decisions.

Add an entry here whenever you create a new migration file. Format: date, what changed, why.

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
