# @platform/data-supabase

The live implementation of `@platform/data`, over Supabase. Consumed by `apps/web`.

```bash
pnpm --filter @platform/data-supabase test
```

## What belongs here

Everything about *how a row is stored*: which table or view to read, how to filter and order
it, which column addresses it, and how to map it onto a read model. A page that knew any of
that would be a page a fixture adapter could not stand in for.

Three consequences that come up repeatedly:

- **Filtering is pushed in, never done by the caller.** A page that fetched everything and
  filtered in the component works against fixtures and falls over against the real table.
- **Addressing is the adapter's decision.** CRM and content detail routes accept a UUID *or*
  a slug; the adapter picks the column. Callers pass the route param as given.
- **Views over base tables where one exists.** `v_ecosystem_feed` already excludes dismissed
  and archived rows and carries the entity context; re-deriving that in the adapter is how the
  two drift apart.

## Writes

Writes take no actor argument. Who did something comes from the bound principal, so a caller
cannot record the wrong one — `acknowledgeChange(id)` stamps `acknowledged_by` itself.

Business rules do *not* live here. The repository supplies the facts a guard is judged
against; the rule and its user-facing wording stay in the server action, where the brand voice
is. `setClientRelevant` is deliberately unguarded for that reason, and a test asserts it
issues exactly one query so a future "helpful" guard goes red.

## Testing

`test/mocks/supabase.ts` is a chainable query-builder fake with row-aware `.range()`, so the
shared pagination contract genuinely exercises this adapter rather than a stub. Each domain
has its own `*.test.ts`; the cross-cutting cases come from `@platform/data/testing`.
