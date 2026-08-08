# Fixture and Trace Schema

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Portfolio Demo App
**Status:** Draft
**Last updated:** 2026-08-07

---

## Part 1 — Fixtures

### The relative dating rule

Fixtures must never contain absolute dates for anything the UI bands by urgency. A demo
authored with a contract renewal on 12 September looks sharp in August and broken in
October.

Every date-bearing fixture stores an **offset in days from the anchor**, and the adapter
resolves it at read time against `ReadContext.asOf`:

```ts
interface DatedFixture {
  /** Days from asOf. Negative is past. */
  dueInDays: number;
}

// resolved at read time
const dueDate = addDays(ctx.asOf, fixture.dueInDays);
const daysUntilDue = fixture.dueInDays;
```

`asOf` defaults to `new Date()` in the demo, so the staged scenario holds forever without
maintenance. Where a fixture genuinely needs a fixed historical date — a contract's
`executedAt`, a research item's publication date — store the offset anyway and accept
that the year drifts. A contract executed "14 months ago" is always plausible; one
executed on a hardcoded date eventually is not.

The one exception is the recorded agent trace, which carries a real timestamp and is
displayed as "recorded on {date}". Honesty is better than a fabricated freshness there.

### Narrative staging

Curate for the screens, not for realism. Every fixture below exists to make a specific
piece of the architecture visible. A plausible-but-flat dataset is the most common way a
portfolio demo fails — everything works and nothing is interesting.

| Fixture | Staging | Makes visible |
|---|---|---|
| PI insurance renewal | `dueInDays: 6`, severity `critical` | Destructive urgency band, the top of the compliance list |
| Annual FSG review | `dueInDays: 26`, severity `high`, recurring annual | Warning band, recurrence handling |
| CPD obligation | `dueInDays: 88`, recurring annual | Normal band — the list is not all alarm |
| Breach monitoring review | `dueInDays: -3`, status `overdue` | Overdue state renders distinctly from merely urgent |
| Engagement letter, fictional client | `renewalInDays: 22`, `noticePeriodDays: 30` | **The key screen.** Decision deadline has already passed while renewal is 22 days out |
| Evergreen vendor agreement | `isEvergreen: true`, no expiry | Null-handling in the renewal column |
| Terminated contract | status `terminated` | Lifecycle states beyond the happy path |
| Report-watch research item | `sourceType: 'report_watch'` | Heterogeneous sources in one feed |
| Podcast research item | `sourceType: 'podcast'`, with segments | Transcript segment provenance |
| Research item with curator note | Non-null `curatorNote` | The curator-notes principle, annotated |
| Stalled CRM deal | last interaction 41 days ago | Where a Findings Engine pack would point |
| Quiet-day agent run | Empty `proposedActions`, `isQuietDay: true` | The quiet-day path — arguably the single most persuasive fixture in the set |
| Draft content item | status `draft`, not embedded | Publish gate boundary |
| Published content item | status `published`, embedded | The other side of the same boundary |

The engagement-letter fixture and the quiet-day run are the two that most reward careful
authoring. The first demonstrates a piece of domain modelling that a generic CRM would
not have. The second demonstrates restraint, which is much rarer in AI products than
capability and reads as maturity to anyone technical.

### Fictional entity rules

- Company names must not resolve to a real business in an ASIC search. Verify before
  committing. Suggested pattern: a plausible-but-invented surname plus a category noun,
  avoiding anything that reads as a real fund manager.
- No real people. No real advisers, no real fund managers, no real ASX-listed entities.
- Contact emails on a domain BTS controls or `example.com`. Never a live third-party
  domain.
- Research feed items: invented titles and one-line paraphrased summaries only. Do not
  reproduce publisher content, abstracts, or headlines from ARK, Fidelity, or any other
  source. This is a copyright constraint as well as a compliance one.
- No bitcoin allocation figures, percentages, targets, or recommendations anywhere.
  Where a screen structurally requires the field, render a redacted placeholder.
- Contract values may appear — they demonstrate the numeric formatting and the mono
  typeface — but keep them modest and obviously illustrative.

### Fixture file layout

```
packages/data-fixtures/src/fixtures/
  anchor.ts             Offset helpers, addDays
  team.ts               Two fictional team members
  companies.ts
  contacts.ts
  obligations.ts
  contracts.ts
  contract-templates.ts
  research-items.ts
  research-segments.ts
  agent-activity.ts
  content-items.ts
  index.ts              Assembled, typed against packages/data read models
```

Type every fixture file against the read model it feeds. When `apps/hq` adds a field, the
fixture package fails to compile. That is the drift alarm working.

---

## Part 2 — Agent trace schema

### Why a BTS-owned schema

The trace format must not import types from `@mastra/core`. Mastra's APIs move quickly,
and a public demo that breaks on an unrelated framework upgrade is the worst kind of
maintenance liability — it fails silently, at the moment someone is looking at it.

The recorder translates from whatever Mastra's current run-observation API provides into
this stable schema. When Mastra changes, only the recorder needs updating, and the demo
keeps working from the already-recorded bundle regardless.

**Before writing the recorder, read the embedded docs for the installed version** at
`node_modules/@mastra/core/dist/docs/`. Do not write it from memory. The relevant surface
is workflow run observation and suspend/resume state — verify the current names rather
than assuming.

### Schema

```ts
export const TRACE_SCHEMA_VERSION = 1 as const;

export interface TraceBundle {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  traceId: string;
  workflowName: string;          // e.g. 'daily-compliance-check'
  recordedAt: string;            // ISO — displayed to the user
  totalDurationMs: number;       // real elapsed, before compression
  steps: TraceStep[];
  redactions: RedactionRecord[];
}

export type TraceStep =
  | WorkflowStartStep
  | AgentInvocationStep
  | ToolCallStep
  | DeterministicComputeStep
  | SuspendStep
  | HumanMessageStep
  | ResumeStep
  | CommitStep
  | WorkflowEndStep;

interface TraceStepBase {
  index: number;
  /** Milliseconds since the previous step, as recorded. */
  offsetMs: number;
  /** Milliseconds to use in replay. Capped and compressed. */
  replayDelayMs: number;
  label: string;                 // shown in the transport timeline
  annotationId?: string;         // links to the annotation layer
}

export interface DeterministicComputeStep extends TraceStepBase {
  kind: 'deterministic_compute';
  description: string;           // e.g. 'Scored 14 obligations against materiality floor'
  /** The committed payload. This is what the narrator will later receive. */
  payload: unknown;
  /** Rows in, rows out. Makes the filtering visible. */
  inputCount: number;
  outputCount: number;
}

export interface AgentInvocationStep extends TraceStepBase {
  kind: 'agent_invocation';
  agentName: string;             // 'Simon', 'Lex', 'Rex'
  /** The exact payload handed in. Must be a subset of a prior committed payload. */
  inputPayload: unknown;
  outputText: string;
  /** Present only if the run used tools. */
  toolCallIndices?: number[];
}

export interface SuspendStep extends TraceStepBase {
  kind: 'suspend';
  reason: string;                // 'Awaiting human approval'
  proposedActions: ProposedAction[];
  /** How the human was contacted. Surfaced in the UI deliberately. */
  channel: 'signal';
}

export interface HumanMessageStep extends TraceStepBase {
  kind: 'human_message';
  direction: 'inbound' | 'outbound';
  body: string;
  senderLabel: string;           // 'Chris' — fictional in the demo
}

export interface ResumeStep extends TraceStepBase {
  kind: 'resume';
  approvedActionIds: string[];
  rejectedActionIds: string[];
}

export interface CommitStep extends TraceStepBase {
  kind: 'commit';
  table: string;                 // 'agent_activity'
  rowSummary: Record<string, unknown>;
}

export interface ProposedAction {
  id: string;
  summary: string;
  targetTable: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface RedactionRecord {
  stepIndex: number;
  field: string;
  reason: 'pii' | 'client_data' | 'credential' | 'internal_positioning';
}
```

### The step that matters

`DeterministicComputeStep` followed by `AgentInvocationStep` is the pair that carries the
architecture. The UI should render them adjacently with a visible boundary: committed
facts on one side, the narrating agent on the other, with the payload shown as the only
thing that crosses. Attach the `deterministic-before-llm` annotation to the boundary
itself, not to either step.

If a recorded run does not produce this pair clearly, re-record with a scenario that does
rather than editing the trace to fake it. The whole value of a recorded trace over a
mockup is that it is a real run, and that property is worth protecting even when nobody
would notice the difference.

### Redaction

The recorder redacts before writing to disk, never after. Redaction is a step in the
recording pipeline, not a cleanup pass — a cleanup pass means real client data exists in
a file on disk at some point, and files on disk get committed.

Replace redacted values with obviously synthetic substitutes drawn from the fixture set,
so the trace stays internally consistent with the rest of the demo. A trace referencing
`Meridian Capital Group` while the contracts list shows different fictional entities
reads as sloppy and undermines the impression the demo exists to create.

Every redaction is recorded in `redactions[]`. Surface the count in the UI: "7 fields
redacted from the recorded run." An evaluator seeing that BTS thought about redaction is
a better outcome than one who assumes nothing needed redacting.

### Timing compression

```ts
function compress(offsetMs: number): number {
  if (offsetMs > 1200) return 1200;
  if (offsetMs < 80) return 80;
  return offsetMs;
}
```

Floor as well as cap. Steps that fire instantly are invisible, and an invisible step in a
replay is a step the evaluator did not learn from. Target total replay time around 45
seconds; if the compressed total exceeds 60, drop `replayDelayMs` proportionally rather
than removing steps.

### Storage

`packages/agent-traces/traces/{traceId}.json`, imported statically. No runtime fetch — the
demo must work with the network disabled, and a trace fetched at runtime is one more thing
that can fail while someone is watching.
