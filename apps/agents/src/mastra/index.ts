import { setDefaultResultOrder } from 'node:dns';
import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { Observability, SamplingStrategyType, DefaultExporter, CloudExporter } from '@mastra/observability';
import { PinoLogger } from '@mastra/loggers';
import type { ApiRouteHandler } from '@mastra/core/server';
import { getResolvedMastraDbUrl } from '../lib/resolveDbUrl.js';
import { createLogger } from '../lib/logger.js';
import { simon } from '../agents/simon/index.js';
import { archie } from '../agents/archivist/index.js';
import { bruno } from '../agents/ba/index.js';
import { charlie } from '../agents/contentCreator/index.js';
import { rex } from '../agents/researcher/index.js';
import { della } from '../agents/relationshipManager/index.js';
import { margot } from '../agents/margot/index.js';
import { recorderWorkflow } from '../agents/recorder/workflow.js';
import { pmWorkflow } from '../agents/pm/workflow.js';
import { executeRoutineWorkflow } from '../workflows/executeRoutineWorkflow.js';
import { pruneStorageWorkflow } from '../workflows/pruneStorageWorkflow.js';
import { newsletterWorkflow } from '../workflows/newsletter/index.js';
import { variantWorkflow } from '../workflows/variant/index.js';
import { strategyWorkflow } from '../workflows/strategy/index.js';
import { handleTelnyxWebhook } from '../webhooks/telnyx.js';
import { handleZoomWebhook } from '../webhooks/zoom.js';
import { handleDeepgramWebhook } from '../webhooks/deepgram.js';
import { startWebDirectivesListener } from '../listeners/webDirectives.js';
import { startSignalListener } from '../listeners/signalListener.js';
import { startContentCreatorListener } from '../listeners/contentCreatorListener.js';
import { startPMListener } from '../listeners/pmListener.js';
import { startFastmailListener } from '../listeners/fastmailListener.js';
import { startResearchMailListener } from '../listeners/researchMailListener.js';
import { startContentEmbeddingListener } from '../listeners/contentEmbeddingListener.js';
import { startVoiceEmbeddingListener } from '../listeners/voiceEmbeddingListener.js';
import { startNewsletterGateWebListener } from '../listeners/newsletterGateWeb.js';
import { startVariantGateWebListener } from '../listeners/variantGateWeb.js';
import { startStrategyGateWebListener } from '../listeners/strategyGateWeb.js';
import { startComplianceRecheckListener } from '../listeners/complianceRecheck.js';
import { startPodcastActionListener } from '../listeners/podcastActionListener.js';
import { startFeedbackDistillListener } from '../listeners/feedbackDistillListener.js';
import { startMarketReportFeedbackListener } from '../listeners/marketReportFeedbackListener.js';
import { AgentActivitySpanProcessor } from '../observability/agentActivityProcessor.js';

// Railway containers have no IPv6 outbound routing. Force Node.js to prefer
// IPv4 when a hostname resolves to both A and AAAA records (e.g. Supabase
// db.[ref].supabase.co can return both). Must be called before any TCP connect.
setDefaultResultOrder('ipv4first');

// Adapt Web API handlers (Request → Response) to Mastra API-route handlers.
// Typed against Mastra's own ApiRouteHandler (its context param is `any`)
// rather than hono's Context: @mastra/core vendors its own copy of hono's
// types, so the app's `hono` Context is a distinct nominal type and won't
// assign here. The adapter only needs `c.req.raw`, which `any` covers.
const honoHandler = (fn: (req: Request) => Promise<Response>): ApiRouteHandler =>
  (c) => fn(c.req.raw);

// MASTRA_DB_URL is the Postgres connection string used exclusively for Mastra's
// internal thread/memory storage (PostgresStore) and PgVector. It is NOT the
// Supabase JS client — that uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY over
// HTTPS and is unaffected. URL resolution (IPv4 rewrite for Railway, fast-fail
// validation) lives in src/lib/resolveDbUrl.ts and is shared with memory.ts.
const resolvedDbUrl = await getResolvedMastraDbUrl();

const storage = new PostgresStore({
  id: 'default',
  connectionString: resolvedDbUrl,
  // Opt-in, age-based retention bounding the growth tables in the Mastra
  // Postgres (MASTRA_DB_URL) — thread memory, observability spans, workflow
  // run snapshots, and schedule fire history all accumulate rows unbounded as
  // a side effect of normal operation. Unset tables are kept forever. Mastra
  // never runs prune() itself; the pruneStorage workflow drives it on a daily
  // cron (see ../workflows/pruneStorageWorkflow.ts). Values are conservative —
  // safe to tune. Does NOT touch the Supabase agent_activity audit table
  // (different database, populated by AgentActivitySpanProcessor).
  retention: {
    memory: { messages: { maxAge: '90d' }, threads: { maxAge: '180d' } },
    observability: { spans: { maxAge: '14d' } },
    workflows: { workflowSnapshot: { maxAge: '30d' } },
    schedules: { triggers: { maxAge: '30d' } },
  },
});

// Observability mirrors agent/tool/workflow spans into agent_activity via a
// SpanOutputProcessor so existing audit dashboards keep working. The
// CloudExporter self-disables when MASTRA_CLOUD_ACCESS_TOKEN is unset, so
// registering it here is a no-op locally and ships traces to Mastra Cloud
// in production once the env var is set on Railway.
//
// DefaultExporter is the local-OTLP exporter that backs the Studio trace view.
// It buffers whole spans — and agent/LLM spans carry very large attributes (full
// prompts, completions, tool args/results) — in an in-memory batch queue. In
// production there is no local collector draining that queue, so it grows without
// bound and pins the small (~256 MB) Railway heap at its ceiling; the recurring
// "heap out of memory" crash inside a regex .replace() was that exhaustion
// surfacing at the next allocation, not a transient regex spike. So enable it
// only in development (where `mastra dev` runs the collector behind Studio), or
// when explicitly opted in for a one-off prod trace-capture session. Sampling
// stays ALWAYS and the AgentActivitySpanProcessor stays registered, so the
// agent_activity audit trail is unchanged — only the heavy local trace buffer is
// dropped in production.
const enableLocalTraceExport =
  process.env['NODE_ENV'] !== 'production' ||
  process.env['MASTRA_DEFAULT_EXPORTER'] === 'true';

const exporters = enableLocalTraceExport
  ? [new DefaultExporter(), new CloudExporter()]
  : [new CloudExporter()];

const observability = new Observability({
  configs: {
    default: {
      serviceName: 'bts-agents',
      sampling: { type: SamplingStrategyType.ALWAYS },
      exporters,
      spanOutputProcessors: [new AgentActivitySpanProcessor()],
    },
  },
});

export const mastra = new Mastra({
  agents: {
    simon,
    archie,
    bruno,
    charlie,
    rex,
    della,
    margot,
  },
  storage,
  observability,
  // Bundler config required by @mastra/core 1.50's stricter deployer (`mastra
  // build`). Two problems it surfaced that the older deployer handled silently:
  //   1. Without `transpilePackages`, the deployer emits a self-referencing
  //      re-export stub for each pnpm-workspace barrel
  //      (`export * from '@platform/shared'` resolving to itself), which rollup
  //      rejects ("MODEL_SCOPES ... reexport that references itself"). Listing
  //      the workspace packages makes it resolve them to their built dist.
  //   2. `xmlbuilder` (CJS, pulled in transitively via rss-parser → xml2js)
  //      can't be bundled, so it's externalized — installed into
  //      `.mastra/output/node_modules` at build time, exactly like `pg`. It's
  //      also declared as a direct dependency in package.json so the deployer
  //      can resolve it out of pnpm's nested layout (otherwise: "couldn't load
  //      xmlbuilder from rss").
  bundler: {
    transpilePackages: ['@platform/shared', '@platform/db', '@platform/signal', '@platform/voice'],
    externals: ['xmlbuilder'],
  },
  // Route Mastra's framework-internal logs through pino too, so they emit the
  // same single-line JSON as the app logger. prettyPrint is off in production
  // (and non-TTY), which is the Railway path — see ../lib/logger.ts.
  logger: new PinoLogger({
    name: 'Mastra',
    level: (process.env['LOG_LEVEL'] as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
    prettyPrint: process.env['NODE_ENV'] !== 'production' && process.stdout.isTTY === true,
  }),
  workflows: {
    recorder: recorderWorkflow,
    pm: pmWorkflow,
    executeRoutine: executeRoutineWorkflow,
    pruneStorage: pruneStorageWorkflow,
    newsletter: newsletterWorkflow,
    variant: variantWorkflow,
    strategy: strategyWorkflow,
  },
  server: {
    apiRoutes: [
      { path: '/webhooks/telnyx', method: 'POST', handler: honoHandler(handleTelnyxWebhook) },
      { path: '/webhooks/zoom', method: 'POST', handler: honoHandler(handleZoomWebhook) },
      { path: '/webhooks/deepgram', method: 'POST', handler: honoHandler(handleDeepgramWebhook) },
    ],
  },
});

// Last-resort guard: log rather than crash on any error that slips through
// module-level handlers (e.g. a delayed ECONNRESET on a closed socket).
const log = createLogger('process');
process.on('uncaughtException', (err) => {
  log.error({ err }, 'Uncaught exception (process continuing)');
});
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled rejection (process continuing)');
});

// Start Supabase Realtime listener for web directives
startWebDirectivesListener();

// Start Signal polling loop — Simon receives messages here and delegates natively
// to specialists registered as subagents (see ../agents/simon/index.ts).
startSignalListener();

// Safety net: Simon-originated content delegation goes through delegate_to_charlie
// and self-persists via persist_content_draft. This listener handles non-Simon
// producers (e.g. recorder workflow → charlie) that dispatch via
// proposed_actions on agent_activity.
startContentCreatorListener();

// Start Supabase Realtime listener for PM dispatches — picks up proposed_actions
// rows from the recorder workflow and routes them through the PM workflow.
startPMListener(mastra);

// Routine scheduling is now handled by Mastra's built-in scheduler — see
// `schedule` field on executeRoutineWorkflow in src/workflows/executeRoutineWorkflow.ts.

// Start Fastmail JMAP polling loop (CRM email → interactions → Della)
startFastmailListener();

// Poll each account's research folder for paid newsletters → news_items
// (separate from the CRM sync; never creates interactions).
startResearchMailListener();

// Keep the content_embeddings RAG store in sync (embed-on-write + backfill).
// Powers the newsletter workflow's retrieval step.
startContentEmbeddingListener();

// Backfill voice_snippets with NULL embeddings on every boot — catches rows
// imported directly into the table (e.g. manual seeding) that skipped the
// seed script's embed-on-save step.
startVoiceEmbeddingListener();

// Resume newsletter gates approved from the web /content page (the web app
// can't reach this server over HTTP, so it writes to newsletter_runs and this
// listener reacts). Mirrors the Signal gate path in newsletterGate.ts.
startNewsletterGateWebListener();

// Resume variant Gate 3 decisions made in the /campaigns variant editor (same
// web→DB→agents pattern: the editor writes content_items.pending_decision).
startVariantGateWebListener();

// Launch + resume the Campaign Strategy workflow's two gates from the /campaigns
// wizard (same web→DB→agents pattern: the wizard writes campaigns.pending_decision
// — a 'start' signal to launch, or a gate decision to resume).
startStrategyGateWebListener();

// Re-run Lex on a campaign variant whose copy was edited (the web edit sets
// compliance_status = 'pending'); a cleared verdict must not survive an edit.
startComplianceRecheckListener();

// Re-run the transcript waterfall for an episode when the web /news/podcasts
// pages request it (Fetch transcript / Transcribe with Deepgram / Retry). Same
// DB-driven pattern as the newsletter gate above.
startPodcastActionListener();

// Distill founder feedback on social drafts (written by /content/[id]) into
// durable per-account guidelines that every future generation injects. Same
// web→DB→agents pattern; includes a startup sweep for feedback missed while down.
startFeedbackDistillListener();

// Distill founder feedback on market-report narrations (written by
// /market-reports/[id]) into the standing guideline list every future
// narration injects. Same web→DB→agents pattern, singleton guideline row.
startMarketReportFeedbackListener();
