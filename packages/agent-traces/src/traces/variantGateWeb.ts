import { TRACE_SCHEMA_VERSION, type TraceBundle } from '../schema';
import { SUSPEND_REPLAY_MS, compress } from '../timing';

/**
 * One run of the `variant` workflow, through the web approval gate.
 *
 * ## ⚠️ Provenance: authored, not recorded
 *
 * `provenance: 'authored'`, and the replay UI says so on screen. Recording a
 * real run needs the agents server, a database, and live model credentials, and
 * this bundle was written against the workflow source instead —
 * `apps/agents/src/workflows/variant/index.ts`, whose step ids (`resolve_context`,
 * `generate_copy`, `compliance_check`, `persist`, `gate3`), payload shapes
 * (`charlieVariantSchema`, `lexVerdictSchema`) and `agent_activity` writes
 * (`variant_generated`, `compliance_checked`) are reproduced faithfully here.
 *
 * **This is a placeholder for a recorded bundle, not a substitute for one.**
 * `traceRecorderProcessor.ts` in `apps/agents` produces the real thing; run it
 * against a seeded synthetic campaign and replace this file. Until then the
 * demo is honest about what a reader is looking at, which is the whole reason
 * `provenance` is in the schema.
 *
 * ## The pair that carries the architecture
 *
 * Step 3 (`deterministic_compute`) followed by step 4 (`agent_invocation`) is
 * the boundary: the committed payload on one side, the drafting agent on the
 * other, and nothing crossing but the payload. The `deterministic-before-llm`
 * annotation attaches to the boundary itself rather than to either step.
 *
 * ## Entities
 *
 * Every name is drawn from the demo's fixture cast, so the trace is internally
 * consistent with the rest of the app. A trace naming an entity that appears
 * nowhere else reads as sloppy and undermines the impression the demo exists to
 * create.
 */

const offsets = [
  0, 412, 88, 6_140, 3_820, 214, 61, 4 * 60 * 60 * 1000 + 12 * 60 * 1000, 340, 118, 96, 74,
];

let index = -1;
const next = () => {
  index += 1;
  return { index, offsetMs: offsets[index] };
};

export const variantGateWebTrace: TraceBundle = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  traceId: 'variant-gate-web',
  workflowName: 'variant',
  // A fixed real instant rather than an offset from the demo anchor: a trace is
  // a record of something that happened at a time, and dating it relative to
  // "now" would be the fabrication the relative-dating rule is meant to avoid.
  recordedAt: '2026-08-12T23:41:07.000Z',
  provenance: 'authored',
  totalDurationMs: offsets.reduce((sum, offset) => sum + offset, 0),
  redactions: [],
  steps: [
    {
      ...next(),
      kind: 'workflow_start',
      replayDelayMs: compress(0),
      label: 'Workflow started',
      trigger: 'Manual — a director asked for a LinkedIn variant of an approved post',
      inputSummary: {
        workflow: 'variant',
        platform: 'linkedin',
        source_content_item: 'cnt-published',
        campaign: null,
      },
    },
    {
      ...next(),
      kind: 'commit',
      replayDelayMs: compress(412),
      label: 'resolve_context',
      table: 'content_items',
      rowSummary: {
        step: 'resolve_context',
        read: 'source post, platform spec, brand voice snippets',
        max_chars: 3000,
      },
    },
    {
      ...next(),
      kind: 'deterministic_compute',
      replayDelayMs: compress(88),
      label: 'Context assembled and committed',
      // The boundary is between this step and the next. The annotation attaches
      // here because this is the last moment the payload is still ours.
      annotationId: 'trace-boundary',
      description:
        'Assembled the drafting context from the source post, the platform spec and the stored voice snippets. Nothing was generated here.',
      inputCount: 14,
      outputCount: 5,
      payload: {
        source_body:
          'Our daily market report ran this morning, computed its findings, scored them, and told us nothing material happened.',
        platform: 'linkedin',
        max_chars: 3000,
        voice_snippets: [
          'Plain, confident, pragmatic. Write to peers, not prospects.',
          'No exclamation marks. Sentence case throughout.',
        ],
        disclaimer_required_for: ['general_advice', 'personal_opinion'],
      },
    },
    {
      ...next(),
      kind: 'agent_invocation',
      replayDelayMs: compress(6_140),
      label: 'generate_copy — charlie',
      agentName: 'charlie',
      // Exactly the committed payload above, and nothing else. Charlie has no
      // database tool and no retrieval tool in this workflow, so there is no
      // path by which anything outside this object could reach the draft.
      inputPayload: {
        source_body:
          'Our daily market report ran this morning, computed its findings, scored them, and told us nothing material happened.',
        platform: 'linkedin',
        max_chars: 3000,
        voice_snippets: [
          'Plain, confident, pragmatic. Write to peers, not prospects.',
          'No exclamation marks. Sentence case throughout.',
        ],
      },
      outputText: [
        'Most mornings our market report says nothing happened.',
        '',
        'It computes its findings first, scores them against the trailing distribution, and only',
        'writes prose if something clears the floor. On a quiet day there is no prose to write, and',
        'the email goes out without an insight section.',
        '',
        'Building that path costs more than not building it. It is also the only way the silence',
        'means anything.',
      ].join('\n'),
    },
    {
      ...next(),
      kind: 'agent_invocation',
      replayDelayMs: compress(3_820),
      label: 'compliance_check — lex',
      agentName: 'lex',
      inputPayload: {
        draft_body: 'Most mornings our market report says nothing happened. […]',
        platform: 'linkedin',
        classification_options: ['educational', 'general_advice', 'personal_opinion'],
      },
      outputText:
        'Educational. Describes a system the business operates. Makes no claim about an asset and gives no direction to a reader about their own position.',
    },
    {
      ...next(),
      kind: 'compliance_verdict',
      replayDelayMs: compress(214),
      label: 'Verdict: cleared',
      annotationId: 'trace-lex-verdict',
      verdict: 'cleared',
      classification: 'educational',
      rationale:
        'Describes the operation of an internal system. No claim about an asset, no direction to the reader about their own position, no timing language.',
      needsDisclaimer: false,
    },
    {
      ...next(),
      kind: 'commit',
      replayDelayMs: compress(61),
      label: 'persist',
      table: 'content_items',
      rowSummary: {
        step: 'persist',
        status: 'review',
        compliance_status: 'cleared',
        is_thread: false,
        type: 'linkedin',
      },
    },
    {
      ...next(),
      kind: 'suspend',
      // Not compressed to the cap. The gate waited four hours for a person, and
      // rendering that as another tick says the opposite of what happened.
      replayDelayMs: SUSPEND_REPLAY_MS,
      label: 'gate3 — suspended, awaiting a person',
      annotationId: 'trace-suspend',
      reason: 'Awaiting human approval. The workflow stops here and holds its state.',
      channel: 'web',
      decisionColumn: 'content_items.pending_decision',
      proposedActions: [
        {
          id: 'act-publish-variant',
          summary: 'Publish the LinkedIn variant as drafted',
          targetTable: 'content_items',
          severity: 'medium',
        },
        {
          id: 'act-request-change',
          summary: 'Send it back to charlie with an instruction',
          targetTable: 'content_items',
          severity: 'low',
        },
      ],
    },
    {
      ...next(),
      kind: 'human_decision',
      replayDelayMs: compress(340),
      label: 'A director approved it',
      channel: 'web',
      decision: 'approved',
      // A web gate decision is not a message, and rendering it as a chat bubble
      // would be a fabrication — hence a null body rather than an invented
      // reply. The Signal path is where a body exists.
      body: null,
      senderLabel: 'Director',
    },
    {
      ...next(),
      kind: 'commit',
      replayDelayMs: compress(118),
      label: 'Decision written to the database',
      table: 'content_items',
      rowSummary: {
        column: 'pending_decision',
        value: { decision: 'approve' },
        note: 'The web app cannot reach the agent server over HTTP. The decision travels through a column.',
      },
    },
    {
      ...next(),
      kind: 'resume',
      replayDelayMs: compress(96),
      label: 'Listener claimed the decision and resumed the run',
      annotationId: 'trace-resume',
      approvedActionIds: ['act-publish-variant'],
      rejectedActionIds: ['act-request-change'],
      claimedVia: 'realtime_listener',
    },
    {
      ...next(),
      kind: 'commit',
      replayDelayMs: compress(74),
      label: 'agent_activity — two audit rows',
      table: 'agent_activity',
      rowSummary: {
        rows: [
          { agent_name: 'charlie', action: 'variant_generated', status: 'approved' },
          { agent_name: 'lex', action: 'compliance_checked', status: 'approved' },
        ],
        workflow_run_id: 'variant-gate-web',
      },
    },
  ],
};
