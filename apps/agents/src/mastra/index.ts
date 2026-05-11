import { setDefaultResultOrder } from 'node:dns';
import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import { Observability, SamplingStrategyType, DefaultExporter, CloudExporter } from '@mastra/observability';
import type { Context } from 'hono';
import { getResolvedMastraDbUrl } from '../lib/resolveDbUrl.js';
import { simon } from '../agents/simon/index.js';
import { archie } from '../agents/archivist/index.js';
import { bruno } from '../agents/ba/index.js';
import { charlie } from '../agents/contentCreator/index.js';
import { rex } from '../agents/researcher/index.js';
import { della } from '../agents/relationshipManager/index.js';
import { recorderWorkflow } from '../agents/recorder/workflow.js';
import { pmWorkflow } from '../agents/pm/workflow.js';
import { executeRoutineWorkflow } from '../workflows/executeRoutineWorkflow.js';
import { handleTelnyxWebhook } from '../webhooks/telnyx.js';
import { handleZoomWebhook } from '../webhooks/zoom.js';
import { handleDeepgramWebhook } from '../webhooks/deepgram.js';
import { startWebDirectivesListener } from '../listeners/webDirectives.js';
import { startSignalListener } from '../listeners/signalListener.js';
import { startContentCreatorListener } from '../listeners/contentCreatorListener.js';
import { startPMListener } from '../listeners/pmListener.js';
import { startFastmailListener } from '../listeners/fastmailListener.js';
import { AgentActivitySpanProcessor } from '../observability/agentActivityProcessor.js';

// Railway containers have no IPv6 outbound routing. Force Node.js to prefer
// IPv4 when a hostname resolves to both A and AAAA records (e.g. Supabase
// db.[ref].supabase.co can return both). Must be called before any TCP connect.
setDefaultResultOrder('ipv4first');

// Adapt Web API handlers (Request → Response) to Hono handlers
const honoHandler = (fn: (req: Request) => Promise<Response>) =>
  (c: Context) => fn(c.req.raw);

// MASTRA_DB_URL is the Postgres connection string used exclusively for Mastra's
// internal thread/memory storage (PostgresStore) and PgVector. It is NOT the
// Supabase JS client — that uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY over
// HTTPS and is unaffected. URL resolution (IPv4 rewrite for Railway, fast-fail
// validation) lives in src/lib/resolveDbUrl.ts and is shared with memory.ts.
const resolvedDbUrl = await getResolvedMastraDbUrl();

const storage = new PostgresStore({
  id: 'default',
  connectionString: resolvedDbUrl,
});

// Observability mirrors agent/tool/workflow spans into agent_activity via a
// SpanOutputProcessor so existing audit dashboards keep working. The
// CloudExporter self-disables when MASTRA_CLOUD_ACCESS_TOKEN is unset, so
// registering it here is a no-op locally and ships traces to Mastra Cloud
// in production once the env var is set on Railway.
const observability = new Observability({
  configs: {
    default: {
      serviceName: 'bts-agents',
      sampling: { type: SamplingStrategyType.ALWAYS },
      exporters: [new DefaultExporter(), new CloudExporter()],
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
  },
  storage,
  observability,
  workflows: {
    recorder: recorderWorkflow,
    pm: pmWorkflow,
    executeRoutine: executeRoutineWorkflow,
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
process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception (process continuing):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled rejection (process continuing):', reason);
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

// Start Fastmail JMAP polling loop
startFastmailListener();
