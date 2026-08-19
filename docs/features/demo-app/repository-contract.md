# Adapter Contract — `@platform/data`

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Portfolio Demo App
**Status:** Draft, reconciled against the live repo 2026-08-08
**Last updated:** 2026-08-08

---

## Purpose

The contract both `apps/web` and `apps/demo` code against. `@platform/data-supabase` and
`@platform/data-fixtures` each implement it. Neither app imports either implementation
directly — both receive their repositories through a provider at the app root.

This document is the only place the two apps meet. If a change is needed here, it affects
both apps by definition, and that is the intended cost.

A third consumer — a client-facing app — is anticipated. It is the reason the seam covers
all of `apps/web` rather than only the demo surfaces, and the reason for the scoping rule
below. It is not designed here.

---

## Design rules

**Read models, not tables.** Repository methods return view-shaped types. Do not expose raw
table rows.

Note the correction: the original draft said "the views already encode the computed fields
… the fixture adapter should produce the same shape rather than recomputing", naming five
views. **Only three of those exist** — `v_open_tasks`, `v_recent_interactions`,
`v_contacts_overview`. `v_compliance_dashboard` and `v_contracts_overview` never did, and
the surfaces they backed are dropped. Several re-picked surfaces have no view at all and
read tables directly (`market_reports`, `news_items`, `agent_activity`, `content_items`).
So the rule is weaker than originally stated: **return view-shaped types whether or not a
view exists.** Where one does, mirror it. Where one does not, the read model is defined
here and the adapter maps to it.

**Computed fields are computed by the adapter.** In Supabase this is `CURRENT_DATE` in a
view or an expression in the query. In fixtures it is derived from an anchor date at read
time — see the relative dating rule in `fixture-and-trace-schema.md`. Never store a
computed field as a literal in a fixture.

**Filtering and sorting belong in the adapter.** If the UI sorts a list client-side, the
demo will look correct and the real app will fall over at scale. Push it down.

**Every method is async.** Even fixture reads.

Note the correction: the original justified this as "otherwise the demo's loading states
never exercise". That does not hold — in a React Server Component an async fixture read
resolves in the same tick and `loading.tsx` never paints. `apps/web` has 31 `loading.tsx`
files, so if exercising them is genuinely wanted the fixture adapter needs a deliberate
delay, not merely an `async` keyword. Keep every method async anyway, for the real reason:
the signatures must be identical across adapters or the components diverge.

**Writes exist in the interface.** The fixture adapter implements them by throwing
`DemoWriteBlockedError`. Omitting them would mean the demo's components differ from the real
app's, which is exactly what this structure exists to prevent.

**Scoping lives at construction, never in a signature.** No read method takes a `clientId`,
`tenantId` or equivalent. A bundle is constructed already scoped to its principal, so a
caller has no way to ask for data it should not see. A `clientId` parameter would put the
security boundary in ~200 call sites, any one of which can pass the wrong value. This costs
nothing today and is what makes a client-facing app a third adapter rather than a
signature change across every repository.

---

## Package layout

```
packages/data/
  src/
    types/           Shared domain read models
    repositories/    Per-domain interface definitions
    errors.ts        DemoWriteBlockedError, NotFoundError
    context.ts       ReadContext, provider, useRepositories hook
    testing/         Contract test harness, parameterised over an adapter
    index.ts

packages/data-supabase/
  src/
    index.ts         createSupabaseRepositories(client, principal): RepositoryBundle

packages/data-fixtures/
  src/
    fixtures/        The curated data
    index.ts         createFixtureRepositories(opts): DemoRepositoryBundle
```

Three packages rather than one with subpath exports, so that `apps/demo` can simply not
depend on `@platform/data-supabase` and have that enforced by `package.json` rather than by
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
detail in `fixture-and-trace-schema.md`. `asOf` defaults in the Supabase adapter so
`apps/web` call sites can omit it — the cost of this parameter falls on the real app and
buys it nothing, so it should not also be boilerplate.

---

## Repository interfaces

Seven domains, matching the re-picked surfaces in `demo-app-spec.md`. `apps/web` will grow
more as the remaining verticals land; those are not part of the demo contract and are not
specified here.

### `MarketReportRepository`

The lead surface. Carries `deterministic-before-llm` and `quiet-day-path`.

```ts
export type ReportStatus = 'published' | 'held' | 'error';
export type ReportMode = 'normal' | 'quiet';

export interface Finding {
  metric: string;
  materiality: number;
  summary: string;
}

export interface MarketReportSummary {
  id: string;
  asOf: string;                    // ISO date, unique per report
  status: ReportStatus;
  reportMode: ReportMode;
  narrationExcerpt: string | null; // null when status = 'error'
  emailed: boolean;
  findingCount: number;
  /** True when report_mode = 'quiet' — nothing cleared the materiality floor. */
  isQuietDay: boolean;
}

export interface MarketReportDetail extends MarketReportSummary {
  narrationMarkdown: string | null;
  /** The selected findings. This is the payload the narrator received — nothing else. */
  findings: Finding[];
  /** Staleness set. Ops only, never narrated. Surfaced to make the split visible. */
  opsFindings: Finding[];
  lintResult: Record<string, unknown> | null;
  lexResult: Record<string, unknown> | null;
}

export interface MarketReportRepository {
  listReports(ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<MarketReportSummary>>;
  getReport(ctx: ReadContext, id: string): Promise<MarketReportDetail>;
}
```

Ordered by `as_of` descending. `isQuietDay` is derived from `report_mode`, not stored
separately.

The `findings` / `narrationMarkdown` split is the point of this surface and the adapter
must preserve it exactly: `findings` is what the narrating agent was handed, and
`narrationMarkdown` is what it produced. Attach the `deterministic-before-llm` annotation
to the boundary between them.

**Note:** `market_reports` is not yet in `packages/db/src/types/database.ts` — today
`apps/web/app/(app)/market-reports/page.tsx:33` casts the client to `any` to read it. This
interface will be the first typed contract over that table, which is a small win worth
noticing rather than a problem to route around.

### `ResearchRepository`

```ts
export type SourceType = 'rss' | 'podcast' | 'youtube' | 'email';

/** Rex's rubric dimensions. Composite = material*0.5 + novelty*0.3 + citation*0.2. */
export interface RubricScores {
  material: number;
  novelty: number;
  citation: number;
  rubricVersion: string;
}

export interface NewsItemSummary {
  id: string;
  title: string;
  sourceName: string;
  sourceType: SourceType;
  publishedAt: string;
  relevanceScore: number | null;
  curatorNotes: string | null;
  topicTags: string[];
  australianRelevance: boolean;
}

export interface NewsItemDetail extends NewsItemSummary {
  summary: string | null;
  keyPoints: string[];
  relevanceReasoning: string | null;
  /** Read from rex_metadata. Null for items ingested before the rubric. */
  rubric: RubricScores | null;
}

export interface SegmentResult {
  id: string;
  episodeId: string;
  segmentIndex: number;
  startSeconds: number;
  speaker: string | null;
  content: string;
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

`sourceType` lives on `news_sources`, not `news_items`; the Supabase adapter joins it.
`rubric` is unpacked from the `rex_metadata` JSONB rather than exposed raw — the shape is
stable enough to type, and typing it is what lets the demo annotate the composite as
arithmetic rather than judgement.

### `AgentActivityRepository`

```ts
export type ActivityStatus =
  | 'pending' | 'approved' | 'rejected' | 'auto' | 'in_progress' | 'error';

export type TriggerType =
  | 'call_transcript' | 'signal_message' | 'manual' | 'scheduled' | 'agent';

export interface ProposedAction {
  id: string;
  summary: string;
  targetTable: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AgentActivitySummary {
  id: string;
  agentName: string;
  action: string;
  status: ActivityStatus;
  triggerType: TriggerType | null;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  proposedActionCount: number;
  workflowRunId: string | null;
  /** Present when a recorded trace exists for this run. Demo only. */
  traceId?: string;
}

export interface AgentActivityDetail extends AgentActivitySummary {
  proposedActions: ProposedAction[];
  approvedActions: ProposedAction[];
  entityType: string | null;
  entityId: string | null;
  notes: string | null;
}

export interface AgentActivityRepository {
  listActivity(
    ctx: ReadContext,
    filter?: { agentName?: string[]; status?: ActivityStatus[] },
    opts?: QueryOptions,
  ): Promise<Paginated<AgentActivitySummary>>;

  getActivity(ctx: ReadContext, id: string): Promise<AgentActivityDetail>;

  /** Write — throws in fixtures. Mirrors apps/web/app/actions/approvals.ts. */
  approveActivity(id: string, decision: 'approved' | 'rejected', response?: string): Promise<void>;
}
```

`status` and `triggerType` are taken from the live CHECK constraints, not from `schema.sql`
— which is stale and omits `in_progress`. `agentName` is left as `string` rather than a
union: the CHECK lists ten agents and changes with some frequency, and pinning it here
would make an unrelated migration a breaking change to this contract.

The original draft specified an `isQuietDay` boolean on this repository, derived from empty
`proposed_actions` on a `scheduled` trigger. Removed — the quiet-day path is a real,
first-class concept on `market_reports.report_mode`, so it belongs there rather than being
inferred here.

### `ContentRepository`

Carries `publish-gate` and `compliance-as-alignment`.

```ts
export type ContentStatus =
  | 'idea' | 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'archived';

export type ComplianceStatus = 'pending' | 'cleared' | 'flagged' | 'overridden';
export type ComplianceClassification = 'educational' | 'general_advice' | 'personal_opinion';

export interface ContentItemSummary {
  id: string;
  title: string;
  type: string;
  status: ContentStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  complianceStatus: ComplianceStatus | null;
  complianceClassification: ComplianceClassification | null;
  needsDisclaimer: boolean;
  /** True once content_embeddings rows exist. The publish gate, made visible. */
  isEmbedded: boolean;
}

export interface ContentItemDetail extends ContentItemSummary {
  body: string | null;
  complianceRationale: string | null;
  complianceCheckedAt: string | null;
  publishedUrl: string | null;
}

export interface ContentRepository {
  listItems(
    ctx: ReadContext,
    filter?: { status?: ContentStatus[] },
    opts?: QueryOptions,
  ): Promise<Paginated<ContentItemSummary>>;

  getItem(ctx: ReadContext, id: string): Promise<ContentItemDetail>;
}
```

`isEmbedded` is derived, not stored — the Supabase adapter checks for `content_embeddings`
rows with `source_table = 'content_items'`. It exists on the read model because the publish
gate needs to be visible as state rather than inferred from a status string. Drafts are
never embedded; embeddings generate on publish via `contentEmbeddingListener`.

### `IndicatorsRepository`, `EcosystemRepository`, `PipelineRepository`

Glance-depth surfaces. Read models mirror the existing views —
`v_indicator_latest` / `v_onchain_dashboard`, `v_ecosystem_feed`, and
`v_contacts_overview` respectively. List methods only; detail methods omitted. Add them
when a surface needs depth, not before.

`EcosystemRepository` should expose `complianceClass` on its read model even at glance
depth — it is the only glance surface carrying an annotation.

`IndicatorsRepository` returns deltas as signed numbers and **must not** return a
direction, colour or sentiment. Rendering deltas neutrally is a compliance-adjacent
decision, not a style preference, and encoding it in the data layer is what stops a future
component reintroducing green-up/red-down.

---

## The bundle and provider

The original specified a single flat `RepositoryBundle` with every domain on it. That does
not survive the full-seam decision: `apps/web` will carry roughly twenty repositories while
the demo renders seven, and a flat bundle would force `@platform/data-fixtures` to
implement domains nobody demos.

Domains are therefore composed, and each app declares the slice it needs:

```ts
export interface RepositoryBundle {
  marketReports: MarketReportRepository;
  research: ResearchRepository;
  agentActivity: AgentActivityRepository;
  content: ContentRepository;
  indicators: IndicatorsRepository;
  ecosystem: EcosystemRepository;
  pipeline: PipelineRepository;
  // ...plus the apps/web-only domains as their verticals land
  /** Adapter self-identification. Drives chrome; never drives business logic. */
  mode: RepositoryMode;
}

export type RepositoryMode = 'live' | 'demo' | 'client';

/** What apps/demo mounts. Compile error if a demo route reaches outside this. */
export type DemoRepositoryBundle = Pick<
  RepositoryBundle,
  'marketReports' | 'research' | 'agentActivity' | 'content'
  | 'indicators' | 'ecosystem' | 'pipeline' | 'mode'
>;
```

`mode` is deliberately narrow in purpose. If a component branches on `mode` to change
anything other than chrome or copy, the apps have started to diverge and the seam has
failed. Grep for it during review. With a third consumer this rule gets **stricter**, not
looser: a client app must differ by scope, never by branch.

Server components receive the bundle from a module-level factory. Client components use
`useRepositories()` from a React context provider mounted at the app root. Both apps mount
the same provider with a different bundle.

In `apps/web` the provider sits alongside the existing `UserProvider` and `ToastProvider`
in `app/(app)/layout.tsx`.

---

## Errors

```ts
export class DemoWriteBlockedError extends Error {
  constructor(
    readonly operation: string,   // e.g. 'approveActivity'
    readonly table: string,       // e.g. 'agent_activity'
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

One contract test suite in `packages/data/src/testing/`, written once and parameterised
over an adapter, that both implementations must pass: shape conformance, sort order,
pagination behaviour, `NotFoundError` on a missing id, and `DemoWriteBlockedError` from the
fixture adapter on every write method. Run it against both in CI.

Parameterising matters more than it did in the original draft — with eleven verticals each
adding its domain's cases, a per-adapter harness would be rewritten eleven times.

This is the cheapest possible insurance against silent divergence, and it is the primary
safety net for the seam work. Playwright is largely the wrong tool there: the risk in that
phase is data wiring — a dropped filter, a wrong `.order()`, a broken pagination boundary —
and screenshots barely catch it. Pair the contract suite with per-vertical RSC tests
following the existing pattern in `apps/web/app/(app)/crm/companies/page.test.tsx`.
