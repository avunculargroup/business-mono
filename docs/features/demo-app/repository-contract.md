# Adapter Contract — `packages/data`

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Portfolio Demo App
**Status:** Draft
**Last updated:** 2026-08-07

---

## Purpose

The contract both `apps/hq` and `apps/demo` code against. `@bts/data-supabase` and
`@bts/data-fixtures` each implement it. Neither app imports either implementation
directly — both receive a `RepositoryBundle` through a provider at the app root.

This document is the only place the two apps meet. If a change is needed here, it affects
both apps by definition, and that is the intended cost.

---

## Design rules

**Read models, not tables.** Repository methods return view-shaped types corresponding to
the existing database views (`v_compliance_dashboard`, `v_contracts_overview`,
`v_open_tasks`, `v_recent_interactions`, `v_contacts_overview`). Do not expose raw table
rows. The views already encode the computed fields (`days_until_due`,
`days_until_renewal`) and the fixture adapter should produce the same shape rather than
recomputing.

**Computed fields are computed by the adapter.** `days_until_due` is computed relative to
the request date in both implementations. In Supabase this is `CURRENT_DATE` in the view.
In fixtures it is derived from an anchor date at read time — see the relative dating rule
in `fixture-and-trace-schema.md`. Never store a computed field as a literal in a fixture.

**Filtering and sorting belong in the adapter.** If the UI sorts a list client-side, the
demo will look correct and the real app will fall over at scale. Push it down.

**Every method is async.** Even fixture reads. Otherwise the demo's loading states never
exercise and the components diverge.

**Writes exist in the interface.** The fixture adapter implements them by throwing
`DemoWriteBlockedError`. Omitting them from the interface would mean the demo's
components differ from the real app's, which is exactly what this whole structure exists
to prevent.

---

## Package layout

```
packages/data/
  src/
    types/           Shared domain types (read models)
    repositories/    Interface definitions
    errors.ts        DemoWriteBlockedError, NotFoundError
    context.ts       RepositoryBundle, provider, useRepositories hook
    index.ts

packages/data-supabase/
  src/
    index.ts         createSupabaseRepositories(client): RepositoryBundle

packages/data-fixtures/
  src/
    fixtures/        The curated data
    index.ts         createFixtureRepositories(opts): RepositoryBundle
```

Three packages rather than one with subpath exports, so that `apps/demo` can simply not
depend on `@bts/data-supabase` and have that enforced by `package.json` rather than by
discipline.

---

## Core types

```ts
export interface QueryOptions {
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/** Passed to every read so fixtures can date relative to a fixed anchor. */
export interface ReadContext {
  /** Defaults to new Date() in Supabase; the demo anchor date in fixtures. */
  asOf: Date;
}
```

`ReadContext` is the mechanism that keeps fixture dates from going stale. Discussed in
detail in `fixture-and-trace-schema.md`.

---

## Repository interfaces

### `ComplianceRepository`

```ts
export type ObligationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ObligationStatus =
  | 'upcoming' | 'in_progress' | 'completed' | 'overdue' | 'waived';

export interface ObligationSummary {
  id: string;
  title: string;
  category: string;
  severity: ObligationSeverity;
  status: ObligationStatus;
  dueDate: string;              // ISO date
  daysUntilDue: number;         // computed against ReadContext.asOf
  alertDaysBefore: number;
  isRecurring: boolean;
  recurrenceInterval: string | null;
  ownerName: string | null;
  relatedDocumentTitle: string | null;
  relatedDocumentType: string | null;
}

export interface ObligationDetail extends ObligationSummary {
  description: string | null;
  regulatoryReference: string | null;
  notes: string | null;
  completedAt: string | null;
}

export interface ComplianceRepository {
  listObligations(
    ctx: ReadContext,
    filter?: { status?: ObligationStatus[]; severity?: ObligationSeverity[] },
    opts?: QueryOptions,
  ): Promise<Paginated<ObligationSummary>>;

  getObligation(ctx: ReadContext, id: string): Promise<ObligationDetail>;

  listExpiringAssets(
    ctx: ReadContext,
    opts?: QueryOptions,
  ): Promise<Paginated<ExpiringAsset>>;

  /** Write — throws DemoWriteBlockedError in the fixture adapter. */
  completeObligation(id: string, completedAt: Date): Promise<void>;
}
```

`listObligations` returns rows ordered by `due_date` ascending, matching
`v_compliance_dashboard`. The urgency band (≤7 destructive, 8–30 warning, else normal) is
derived in `packages/ui` from `daysUntilDue`, not returned by the repository — it is a
presentation concern and belongs with the tokens.

### `ContractsRepository`

```ts
export interface ContractSummary {
  id: string;
  title: string;
  contractType: string;
  status: ContractStatus;
  counterpartyName: string;
  companyName: string | null;
  contactName: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalDate: string | null;
  isEvergreen: boolean;
  noticePeriodDays: number | null;
  alertDaysBefore: number;
  daysUntilRenewal: number | null;
  daysUntilExpiry: number | null;
  /**
   * renewalDate minus noticePeriodDays, as days from asOf.
   * The field that makes this feature worth building — the decision deadline
   * is earlier than the renewal date, and that is what a person needs to see.
   */
  daysUntilDecision: number | null;
  contractValue: number | null;
  monthlyValue: number | null;
  internalOwnerName: string | null;
}

export interface ContractDetail extends ContractSummary {
  body: string;                              // populated markdown
  variableValues: Record<string, unknown>;
  templateName: string | null;
  sentAt: string | null;
  signedAt: string | null;
  executedAt: string | null;
  notes: string | null;
}

export interface ContractsRepository {
  listContracts(
    ctx: ReadContext,
    filter?: { status?: ContractStatus[] },
    opts?: QueryOptions,
  ): Promise<Paginated<ContractSummary>>;

  getContract(ctx: ReadContext, id: string): Promise<ContractDetail>;
  listTemplates(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<TemplateSummary>>;
}
```

`daysUntilDecision` does not exist in `v_contracts_overview` today. Add it to the view as
part of Session 1 rather than computing it in TypeScript — it is a derived fact about the
data, and per the deterministic-before-LLM principle these belong in the data layer where
an agent reading the view gets them too.

### `ResearchRepository`

```ts
export type SourceType = 'rss' | 'podcast' | 'email' | 'report_watch';

export interface NewsItemSummary {
  id: string;
  title: string;
  sourceName: string;
  sourceType: SourceType;
  publishedAt: string;
  noveltyScore: number | null;     // Rex
  curatorNote: string | null;
  topicTags: string[];
}

export interface ResearchRepository {
  listItems(
    ctx: ReadContext,
    filter?: { sourceType?: SourceType[]; tags?: string[] },
    opts?: QueryOptions,
  ): Promise<Paginated<NewsItemSummary>>;

  getItem(ctx: ReadContext, id: string): Promise<NewsItemDetail>;

  /**
   * Fixture adapter implements this as a keyword match over fixture segments.
   * Do not attempt to fake vector similarity — a plain match that behaves
   * predictably is more honest than a scored one that is invented.
   */
  searchSegments(
    ctx: ReadContext,
    query: string,
    opts?: QueryOptions,
  ): Promise<Paginated<SegmentResult>>;
}
```

### `AgentActivityRepository`

```ts
export interface AgentActivitySummary {
  id: string;
  agentName: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected' | 'auto';
  triggerType: string | null;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  proposedActionCount: number;
  /** True when the run completed with no findings above the materiality floor. */
  isQuietDay: boolean;
  /** Present when a recorded trace exists for this run. Demo only. */
  traceId?: string;
}

export interface AgentActivityRepository {
  listActivity(
    ctx: ReadContext,
    filter?: { agentName?: string[] },
    opts?: QueryOptions,
  ): Promise<Paginated<AgentActivitySummary>>;

  getActivity(ctx: ReadContext, id: string): Promise<AgentActivityDetail>;

  /** Write — throws in fixtures. */
  approveActions(id: string, actionIds: string[], approvedBy: string): Promise<void>;
}
```

`isQuietDay` is a derived boolean, not a stored column. Compute it in the adapter as
`proposed_actions` being empty on a `scheduled` trigger. It exists on the read model
because the quiet-day path needs a first-class UI state rather than an empty list that
looks like a bug.

### `PipelineRepository` and `ContentRepository`

Glance-depth surfaces. `listContacts` and `listContentItems` returning the existing view
shapes, with detail methods omitted for now. Add them when a surface needs depth, not
before.

---

## The bundle and provider

```ts
export interface RepositoryBundle {
  compliance: ComplianceRepository;
  contracts: ContractsRepository;
  research: ResearchRepository;
  agentActivity: AgentActivityRepository;
  pipeline: PipelineRepository;
  content: ContentRepository;
  /** Adapter self-identification. Drives demo chrome; never drives business logic. */
  mode: 'live' | 'demo';
}
```

`mode` is deliberately narrow in purpose. If a component branches on `mode` to change
anything other than chrome or copy, the two apps have started to diverge and the seam has
failed. Grep for it during review.

Server components receive the bundle from a module-level factory. Client components use
`useRepositories()` from a React context provider mounted at the app root. Both apps mount
the same provider with a different bundle.

---

## Errors

```ts
export class DemoWriteBlockedError extends Error {
  constructor(
    readonly operation: string,   // e.g. 'completeObligation'
    readonly table: string,       // e.g. 'compliance_obligations'
  ) {
    super(`${operation} is disabled in demo mode`);
    this.name = 'DemoWriteBlockedError';
  }
}

export class NotFoundError extends Error {
  constructor(readonly entity: string, readonly id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}
```

The `table` field on `DemoWriteBlockedError` is what lets the demo toast say which table
the write would have touched. That specificity is a large part of what makes the demo
read as real rather than as a mockup.

---

## Verification

Write one contract test suite in `packages/data` that both implementations must pass:
shape conformance, sort order, pagination behaviour, `NotFoundError` on a missing id, and
`DemoWriteBlockedError` from the fixture adapter on every write method. Run it against
both in CI.

This is the cheapest possible insurance against silent divergence, and it takes about an
hour to write.
