#!/usr/bin/env bash
# Guardrail: every file in supabase/migrations/ must have a unique 14-digit
# version prefix. Supabase stores that prefix as the primary key of
# supabase_migrations.schema_migrations, so two files sharing it silently break
# `supabase db push`: one is skipped as "already applied" (its DDL never runs)
# and the other aborts the push with a duplicate-key error. That is exactly how
# the findings-engine tables failed to reach prod — see docs/schema-changes.md
# (2026-07-20). This check fails the PR before such a collision can merge.
set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "migration check: directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

status=0

# 1. Filenames must be <14-digit-version>_<name>.sql
while IFS= read -r file; do
  base=$(basename "$file")
  if ! [[ "$base" =~ ^[0-9]{14}_.+\.sql$ ]]; then
    echo "migration check: malformed filename (expected <14-digit-version>_<name>.sql): $base" >&2
    status=1
  fi
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)

# 2. Version prefixes must be unique
dupes=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -exec basename {} \; \
  | grep -oE '^[0-9]{14}' \
  | sort | uniq -d)

if [ -n "$dupes" ]; then
  status=1
  echo "migration check: duplicate version prefix(es) found:" >&2
  for v in $dupes; do
    echo "  $v:" >&2
    ls "$MIGRATIONS_DIR"/"${v}"_*.sql 2>/dev/null | sed 's/^/    /' >&2
  done
fi

if [ "$status" -eq 0 ]; then
  count=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
  echo "migration check: OK ($count files, all version prefixes unique)"
fi

exit $status
