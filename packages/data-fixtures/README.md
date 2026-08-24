# @platform/data-fixtures

The demo's data source: `@platform/data`'s interfaces over static typed objects. What
`apps/demo` mounts instead of a database.

```bash
pnpm --filter @platform/data-fixtures test
```

## It cannot reach a database, and that is structural

It depends on `@platform/data` and `@platform/shared` and nothing else — no client, no
network, no filesystem. There is no runtime guard anywhere; a runtime fetch here would need a
dependency the package does not have. `apps/demo/lib/boundary.test.ts` asserts the whole
transitive graph, so acquiring one goes red.

`createFixtureRepositories()` takes no arguments at all. Nothing to connect to, nothing to
scope. It returns a `DemoBundle` — the seven domains the demo renders — so `campaigns` is
absent rather than stubbed.

## Two rules that are easy to break

**Every date is an offset from `ReadContext.asOf`, resolved at read time.** A demo authored
with a report dated 12 September looks sharp in August and broken in October. Use `at`,
`onDate` and `todayAt` from `fixtures/anchor.ts`; `todayAt` exists because "a few hours ago"
crosses midnight and anything that must be *today* then silently isn't — which is exactly how
the research digest first shipped permanently empty.

**Every write throws `DemoWriteBlockedError` naming the real Postgres table.** The table is
the feature: it is what lets the demo read as a real app with its hands tied rather than a
mockup with dead buttons. `expectWriteBlocked` checks the table, not just the error type.

## The fixtures themselves

`fixtures/` is curated for the screens, not for realism — each row exists to make one
architectural claim legible in a few seconds. The staging table in
[`fixture-and-trace-schema.md`](../../docs/features/demo-app/fixture-and-trace-schema.md#narrative-staging)
says which claim each carries, and `fixtures/content.test.ts` asserts the claims still hold:
that the quiet day scored a finding and still said nothing, that a change is unclassified so
the promotion gate's fail-closed path has a row, that deltas carry both signs and a zero. The
likeliest way this set degrades is not a compliance breach — it is someone editing a fixture
into blandness and nothing noticing.

That test also enforces the compliance rules mechanically: no bitcoin allocation figure
anywhere, no banned terminology, no exclamation marks, every email on `example.com`, every
entity name sourced from `fixtures/entities.ts`, and no real institution named as the source
of an invented statement.

**Two things it cannot check, both outstanding:** the ASIC search over the invented company
names, and the Lex classification pass over the prose. See the warnings at the top of
`fixtures/entities.ts` and `fixtures/content.test.ts`.
