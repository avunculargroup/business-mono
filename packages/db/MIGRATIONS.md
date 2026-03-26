# Database Migration Workflow

Migrations are managed with the Supabase CLI. All migration files live in
`supabase/migrations/` at the repo root.

`schema.sql` is a consolidated human-readable reference — **do not run it
against a live database**. The migration sequence in `supabase/migrations/`
is the execution source of truth.

## How migrations are applied

Migrations are applied **automatically** when a migration file is merged to `main`:

```
git push → main (with new supabase/migrations/* file)
    ↓
GitHub Actions (.github/workflows/migrate.yml)
    → supabase db push
    → applies all pending migrations to the remote DB
```

The workflow only triggers when `supabase/migrations/**` changes, so regular
code pushes without schema changes don't waste CI time.

---

## Day-to-day: adding a new migration

### 1. Create the migration file

```
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```

Use the current UTC timestamp. Example:

```
supabase/migrations/20260401120000_add_webhook_logs_table.sql
```

Write standard SQL. Make it idempotent where possible (`IF NOT EXISTS`,
`CREATE OR REPLACE`, exception handlers). See existing migrations for examples.

### 2. Update schema.sql

Edit `schema.sql` at the repo root to reflect the new consolidated state.
This keeps it current as a human-readable reference for onboarding and
architecture review.

### 3. Add a changelog entry

Add a dated entry to `docs/schema-changes.md` explaining what changed and why.

### 4. Check for drift (optional but recommended)

```bash
pnpm db:diff
```

If output is non-empty, the live DB has changes not captured in migrations.
Resolve before pushing (see Detecting Drift below).

### 5. Open a PR and merge

GitHub Actions applies the migration automatically on merge to `main`.
No manual `supabase db push` needed.

### 6. Regenerate TypeScript types

After the Actions job completes:

```bash
pnpm db:generate-types
```

Commit the updated `packages/db/src/types/database.ts` as a follow-up commit.

---

## Local development scripts

These scripts are available from the repo root (or via `pnpm --filter @platform/db`):

| Script | What it does |
|--------|-------------|
| `pnpm db:migrate` | Push pending migrations to remote (`supabase db push`) |
| `pnpm db:diff` | Show drift between local migrations and remote DB |
| `pnpm db:pull` | Pull remote schema into a new migration file |
| `pnpm db:reset` | Reset local DB and re-apply all migrations + seed |
| `pnpm db:generate-types` | Regenerate `packages/db/src/types/database.ts` |

---

## Detecting drift

If you suspect the live database has diverged from the migration history:

```bash
pnpm db:diff
```

Non-empty output means drift. To capture remote changes as a new migration:

```bash
pnpm db:pull
```

Review the generated file before committing. Never edit past migration files —
write a new forward migration instead.

---

## First-time setup on an existing database

If you're adopting this workflow on a database that was set up manually
(without migration tracking), the `supabase_migrations.schema_migrations`
tracking table won't exist. When `supabase db push` runs for the first time,
it will create the tracking table and then attempt to apply all migrations.

Because the baseline migration (`20260319000000_initial_schema.sql`) is
written idempotently, it is safe to run against an existing database:

- `CREATE TABLE IF NOT EXISTS` skips existing tables
- `CREATE OR REPLACE TRIGGER/FUNCTION/VIEW` updates existing objects
- `DROP POLICY IF EXISTS` + `CREATE POLICY` replaces existing policies
- The `ALTER PUBLICATION` is wrapped in an exception handler

No manual bootstrapping is required — just run `pnpm db:migrate`.

---

## Required GitHub secrets

Add these in GitHub → repo Settings → Secrets and variables → Actions:

| Secret | Where to find it |
|--------|-----------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_ID` | Supabase dashboard → Project Settings → General |
| `SUPABASE_DB_PASSWORD` | Supabase dashboard → Project Settings → Database |

---

## Never do this

- Do not run `schema.sql` directly. It will fail on existing objects.
- Do not apply changes via the Supabase dashboard SQL editor without also
  creating a migration file. If you must do an emergency fix in the dashboard,
  immediately run `pnpm db:pull` to capture it as a migration.
- Do not edit past migration files. They are immutable once applied.
  Write a new forward migration to undo or modify something.
- Do not add `db:migrate`, `db:diff`, or `db:pull` to `turbo.json`.
  Turbo caching would silently skip database pushes.
