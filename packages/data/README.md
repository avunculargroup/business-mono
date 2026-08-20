# @platform/data

Repository interfaces, the read models behind them, and the contract test harness both
adapters run. **No database client, no app code** — that is the point: a fixture-backed app
can depend on these interfaces without being able to reach a database.

```
src/
  bundle.ts        RepositoryDomains, Bundle<K>, RepositoryBundle, DemoBundle, Principal
  context.ts       ReadContext, Paginated, QueryOptions
  errors.ts        NotFoundError, DemoWriteBlockedError
  provider.tsx     React context — subpath export, see below
  repositories/    One interface per domain
  testing/         The contract suite, parameterised over an adapter
```

## Three rules worth knowing before you edit this

**Scoping is a constructor argument or it does not exist.** No read method takes a
`clientId`, `tenantId` or equivalent. `createSupabaseRepositories(client, principal)` returns
a bundle that cannot see rows outside its principal, so a caller has no way to ask the wrong
question. `ReadContext` carries `asOf` and nothing else, guarded at compile time by
`READ_CONTEXT_KEYS_ARE_EXHAUSTIVE` and at runtime by `context.test.ts` — adding a field fails
both. A `principal` field there would put the security boundary back into ~200 call sites
while every signature still looked compliant.

**The bundle is a slice, not a monolith.** `Bundle<K>` picks domains; `RepositoryBundle` is
all of them and `DemoBundle` is the seven the demo renders. `@platform/data-fixtures`
implements only that slice, so a demo route reaching for `campaigns` is a compile error
rather than a stub that throws. `useRepositories<'research'>()` takes its slice explicitly and
has no default, so a component names its data dependencies in its own source.

**Read models describe what is stored, not what a table looks like.** Ordinary rows are
camel-cased; workflow-owned JSONB payloads (`PlannedBeat`, `Gate1State`, `Finding`) keep their
snake_case, because that is the shape the engine actually writes and reads.

## Subpath exports

- `@platform/data` — interfaces, models, errors
- `@platform/data/provider` — the React provider. Deliberately **not** re-exported from the
  root: it is a `.tsx` module, and adapters with no React and no `jsx` setting fail
  `tsc --noEmit` on JSX they never asked for.
- `@platform/data/testing` — the contract suite. A new domain adds cases here rather than
  building its own harness; both adapters must pass the same suite.

See [`docs/features/demo-app/repository-contract.md`](../../docs/features/demo-app/repository-contract.md).
