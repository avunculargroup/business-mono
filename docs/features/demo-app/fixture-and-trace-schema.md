# Fixture and Trace Schema

**Platform:** Bitcoin Treasury Solutions Internal Platform
**Feature:** Portfolio Demo App
**Status:** Draft, reconciled against the live repo 2026-08-08
**Last updated:** 2026-08-08

---

## Part 1 — Fixtures

### The relative dating rule

Fixtures must never contain absolute dates for anything the UI bands by urgency or
recency. A demo authored with a report dated 12 September looks sharp in August and broken
in October.

Every date-bearing fixture stores an **offset in days from the anchor**, and the adapter
resolves it at read time against `ReadContext.asOf`:

```ts
interface DatedFixture {
  /** Days from asOf. Negative is past. */
  publishedInDays: number;
}

// resolved at read time
const publishedAt = addDays(ctx.asOf, fixture.publishedInDays);
```

`asOf` defaults to `new Date()` in the demo, so the staged scenario holds forever without
maintenance. Where a fixture genuinely needs a fixed historical date, store the offset
anyway and accept that the year drifts. A report published "three days ago" is always
plausible; one published on a hardcoded date eventually is not.

The one exception is the recorded agent trace, which carries a real timestamp and is
displayed as "recorded on {date}". Honesty is better than a fabricated freshness there.

### Narrative staging

Curate for the screens, not for realism. Every fixture below exists to make a specific
piece of the architecture visible. A plausible-but-flat dataset is the most common way a
portfolio demo fails — everything works and nothing is interesting.

**This table was re-derived from scratch.** The original staged compliance obligations and
contracts — a PI insurance renewal, an engagement letter with a notice period, an evergreen
vendor agreement. None of those tables exist. Every row below is new, and each is chosen
because it makes one architectural claim legible in a few seconds.

| Fixture | Staging | Makes visible |
|---|---|---|
| Quiet-day market report | `report_mode: 'quiet'`, one finding below the floor, `asOfInDays: -1` | **The key screen.** The system says nothing material happened rather than manufacturing insight |
| Normal market report | `report_mode: 'normal'`, 4 findings above the floor, `asOfInDays: -3` | The other side of the same boundary — what "material" actually looks like |
| Market report with ops findings | Non-empty `opsFindings`, empty of narration references | Staleness findings exist, are tracked, and are deliberately never narrated |
| Held market report | `status: 'held'` | Narration failed lint or Lex and was withheld; the pipeline has a refusal path |
| Research item with curator note | Non-null `curatorNotes`, `publishedInDays: -2` | The curator-notes principle — human annotation is what separates this from generic retrieval |
| Research item with full rubric | `rubric: { material, novelty, citation }`, mid-range composite | The composite is arithmetic over scored dimensions, not a model's overall impression |
| Research item, low relevance | Composite below the promotion threshold | The rubric rejects things; a scorer that only ever approves is not a scorer |
| Podcast item with segments | `sourceType: 'podcast'`, 6 transcript segments with speakers | Transcript segment provenance, and heterogeneous sources in one feed |
| Email-sourced research item | `sourceType: 'email'` | Same feed, wholly different ingestion path |
| Draft content item | `status: 'draft'`, `isEmbedded: false` | Publish gate — drafts are never embedded |
| Published content item | `status: 'published'`, `isEmbedded: true` | The other side of the gate |
| Content item, Lex flagged | `complianceStatus: 'flagged'`, `classification: 'general_advice'`, non-null rationale | Compliance review is a gate in the pipeline with a stated reason, not a checkbox |
| Quiet agent run | `status: 'auto'`, empty `proposedActions`, `triggerType: 'scheduled'` | Scheduled runs that find nothing still log; absence of output is recorded, not silent |
| Agent run awaiting approval | `status: 'pending'`, 3 `proposedActions` | The approval wall, and what a proposal actually contains |
| Ecosystem change | Non-null `complianceClass` | Change detection carries a classification before it reaches a human |
| Indicator set with mixed deltas | Both signs, rendered identically | Neutral delta colour — no green-up/red-down |
| Stalled CRM company | Last interaction 41 days ago | Where a findings pack would point |

The quiet-day report and the Lex-flagged content item are the two that most reward careful
authoring. The first demonstrates restraint, which is much rarer in AI products than
capability and reads as maturity to anyone technical. The second demonstrates that
compliance was designed in rather than bolted on — which, for a business operating as an
Authorised Representative, is the whole point.

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
- Market report narration must read as market commentary, never as advice. It is the
  highest-risk prose in the fixture set because it is the most plausible-sounding. Run it
  past Lex like everything else, and treat a `flagged` verdict on a fixture as a signal to
  rewrite rather than to override.
- Indicator and metric values may appear — they demonstrate numeric formatting and the mono
  typeface — but keep them obviously illustrative.

### Fixture file layout

```
packages/data-fixtures/src/fixtures/
  anchor.ts             Offset helpers, addDays
  team.ts               Two fictional team members
  companies.ts
  contacts.ts
  market-reports.ts
  findings.ts
  research-items.ts
  research-segments.ts
  agent-activity.ts
  content-items.ts
  ecosystem-changes.ts
  indicators.ts
  index.ts              Assembled, typed against packages/data read models
```

Type every fixture file against the read model it feeds. When `apps/web` adds a field, the
fixture package fails to compile. That is the drift alarm working — and it will fire
roughly weekly, so see the drift policy in `build-progress.md` before deciding it is
broken.

---

## Part 2 — Agent trace schema

### Why a BTS-owned schema

The trace format must not import types from `@mastra/core`. Mastra's APIs move quickly,
and a public demo that breaks on an unrelated framework upgrade is the worst kind of
maintenance liability — it fails silently, at the moment someone is looking at it.

The recorder translates from Mastra's run-observation output into this stable schema. When
Mastra changes, only the recorder needs updating, and the demo keeps working from the
already-recorded bundle regardless.

**The hook already exists.** The original said to read the embedded docs at
`node_modules/@mastra/core/dist/docs/` before writing the recorder. Still worth doing after
`pnpm install` — but the useful finding is that `spanOutputProcessors` is already
configured on the `Observability` config in `apps/agents/src/mastra/index.ts:103-120`, and
`apps/agents/src/observability/agentActivityProcessor.ts` is a working reference
implementation. **A recorder is a second `SpanOutputProcessor`.** No workflow
instrumentation is needed.

One trap: that processor hardcodes `VALID_AGENT_NAMES` at line 19 and silently drops spans
whose agent is not in the list — including `lex`. Do not copy the filter; the Lex step is
part of what this trace exists to show.

Pinned versions: `@mastra/core ^1.54.0`, `@mastra/observability ^1.16.3`.

### What gets recorded

The `variant` workflow (`apps/agents/src/workflows/variant/index.ts`). The original
specified a Simon run; Simon is a Mastra `Agent` and cannot suspend — only workflows can.

The run to capture:

1. `variant.generate_copy` — the drafting step
2. `variant.compliance_check` — Lex reviews the draft and returns a verdict
3. `gate3` suspend (lines 327-388) — awaiting human approval
4. The web gate: `content_items.pending_decision` is written, then claimed by
   `startVariantGateWebListener` (`workflows/variant/run.ts:50-60`)
5. Resume, then the `agent_activity` writes at lines 116 and 126

**Record against a seeded synthetic campaign, not a production run.** The recorder is new
code and redaction is its first live exercise; recording a real run means real client data
passes through untested redaction. Seeding a synthetic campaign costs an hour and means
real data is never in scope. Redaction stays in the pipeline regardless — belt and braces.

### Schema

```ts
export const TRACE_SCHEMA_VERSION = 1 as const;

export interface TraceBundle {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  traceId: string;
  workflowName: string;          // 'variant'
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
  | ComplianceVerdictStep
  | SuspendStep
  | HumanDecisionStep
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
  description: string;           // e.g. 'Scored 14 findings against materiality floor'
  /** The committed payload. This is what the narrator will later receive. */
  payload: unknown;
  /** Rows in, rows out. Makes the filtering visible. */
  inputCount: number;
  outputCount: number;
}

export interface AgentInvocationStep extends TraceStepBase {
  kind: 'agent_invocation';
  agentName: string;             // 'charlie', 'lex', 'margot'
  /** The exact payload handed in. Must be a subset of a prior committed payload. */
  inputPayload: unknown;
  outputText: string;
  /** Present only if the run used tools. */
  toolCallIndices?: number[];
}

/** Lex's verdict, rendered as a first-class step rather than a tool call. */
export interface ComplianceVerdictStep extends TraceStepBase {
  kind: 'compliance_verdict';
  verdict: 'cleared' | 'flagged';
  classification: 'educational' | 'general_advice' | 'personal_opinion';
  rationale: string;
  needsDisclaimer: boolean;
  /** Present when flagged — verdictToActivity writes a suggested_rewrite action. */
  suggestedRewrite?: string;
}

export interface SuspendStep extends TraceStepBase {
  kind: 'suspend';
  reason: string;                // 'Awaiting human approval'
  proposedActions: ProposedAction[];
  /** How the human was reached. Surfaced in the UI deliberately. */
  channel: 'signal' | 'web';
  /** Set when channel = 'web'. The column the decision is written to. */
  decisionColumn?: string;       // 'content_items.pending_decision'
}

export interface HumanDecisionStep extends TraceStepBase {
  kind: 'human_decision';
  channel: 'signal' | 'web';
  decision: 'approved' | 'rejected' | 'edited';
  body: string | null;           // the reply text, or null for a bare web approval
  senderLabel: string;           // fictional in the demo
}

export interface ResumeStep extends TraceStepBase {
  kind: 'resume';
  approvedActionIds: string[];
  rejectedActionIds: string[];
  /** How the run learned of the decision. */
  claimedVia: 'realtime_listener' | 'signal_listener';
}

export interface CommitStep extends TraceStepBase {
  kind: 'commit';
  table: string;                 // 'content_items', 'agent_activity'
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

Three changes from the original, all forced by recording a real workflow rather than an
imagined one:

- `SuspendStep.channel` widens from `'signal'` to `'signal' | 'web'`, with
  `decisionColumn` for the web path.
- `HumanMessageStep` becomes `HumanDecisionStep`. A web gate decision is not a message and
  rendering it as a chat bubble would be a fabrication.
- `ComplianceVerdictStep` is new. Lex's verdict is a distinct architectural moment and
  flattening it into a tool call would waste the strongest thing about this workflow.

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

### The web gate, rendered honestly

The suspend → decision → resume sequence should show the actual mechanism, not a simplified
one. The agent server is not reachable over HTTP from the web app, so the decision travels
through a database column: `/content` writes `content_items.pending_decision`, and a
Supabase Realtime listener claims it atomically before resuming. Render the write and the
claim as separate steps.

This is more interesting than the chat-bubble version the original specified, not less. It
is a real constraint producing a real design, and an evaluator who understands it has
learned something about the system rather than about its UI.

### Redaction

The recorder redacts before writing to disk, never after. Redaction is a step in the
recording pipeline, not a cleanup pass — a cleanup pass means real client data exists in
a file on disk at some point, and files on disk get committed.

Replace redacted values with obviously synthetic substitutes drawn from the fixture set,
so the trace stays internally consistent with the rest of the demo. A trace referencing an
entity that appears nowhere in the content or research fixtures reads as sloppy and
undermines the impression the demo exists to create.

Every redaction is recorded in `redactions[]`. Surface the count in the UI: "7 fields
redacted from the recorded run." An evaluator seeing that BTS thought about redaction is
a better outcome than one who assumes nothing needed redacting.

Recording against a seeded synthetic campaign should drive this count low or to zero. That
is fine and worth stating in the UI rather than padding — "recorded against a synthetic
campaign; no client data was in scope" is a stronger claim than a redaction count.

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

Note that the gate suspend is the one gap that should **not** compress to the cap. A
suspend that lasted hours in reality should read as a pause with a visible state change,
not as another 1200ms tick — the whole point of the step is that the machine stopped and
waited for a person.

### Storage

`packages/agent-traces/traces/{traceId}.json`, imported statically. No runtime fetch — the
demo must work with the network disabled, and a trace fetched at runtime is one more thing
that can fail while someone is watching.
