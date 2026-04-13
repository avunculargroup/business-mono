import { setDefaultResultOrder } from 'node:dns';
import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';
import type { Context } from 'hono';
import { simon } from '../agents/simon/index.js';
import { archie } from '../agents/archivist/index.js';
import { bruno } from '../agents/ba/index.js';
import { charlie } from '../agents/contentCreator/index.js';
import { rex } from '../agents/researcher/index.js';
import { della } from '../agents/relationshipManager/index.js';
import { recorderWorkflow } from '../agents/recorder/workflow.js';
import { pmWorkflow } from '../agents/pm/workflow.js';
import { monitorResearchWorkflow } from '../agents/researcher/workflow.js';
import { handleTelnyxWebhook } from '../webhooks/telnyx.js';
import { handleZoomWebhook } from '../webhooks/zoom.js';
import { handleDeepgramWebhook } from '../webhooks/deepgram.js';
import { startWebDirectivesListener } from '../listeners/webDirectives.js';
import { startSignalListener } from '../listeners/signalListener.js';
import { startContentCreatorListener } from '../listeners/contentCreatorListener.js';
import { startBAListener } from '../listeners/baListener.js';
import { startPMListener } from '../listeners/pmListener.js';
import { startMonitorListener } from '../listeners/monitorListener.js';
import { startRelationshipManagerListener } from '../listeners/relationshipManagerListener.js';
import { startFastmailListener } from '../listeners/fastmailListener.js';

// Railway containers have no IPv6 outbound routing. Force Node.js to prefer
// IPv4 when a hostname resolves to both A and AAAA records (e.g. Supabase
// db.[ref].supabase.co can return both). Must be called before any TCP connect.
setDefaultResultOrder('ipv4first');

// Adapt Web API handlers (Request → Response) to Hono handlers
const honoHandler = (fn: (req: Request) => Promise<Response>) =>
  (c: Context) => fn(c.req.raw);

const supabaseDbUrl = process.env['SUPABASE_DB_URL'];
if (!supabaseDbUrl) {
  throw new Error(
    'SUPABASE_DB_URL is not set. Add the direct Postgres connection string — ' +
    'find it in Supabase dashboard → Settings → Database → Connection string ' +
    '(Direct connection, port 5432, host db.[ref].supabase.co). ' +
    'Do NOT use the Transaction Pooler URL (port 6543) — that host resolves to IPv6 ' +
    'which is unreachable on Railway.'
  );
}

// Guard against Supabase Pooler URLs (both Transaction Pooler :6543 and Session
// Pooler :5432) — pooler.supabase.com resolves to IPv6 which Railway cannot reach.
// The direct connection (db.[ref].supabase.co:5432) resolves to IPv4 and works.
if (supabaseDbUrl.includes('pooler.supabase.com') || supabaseDbUrl.includes(':6543')) {
  throw new Error(
    'SUPABASE_DB_URL is set to a Supabase Pooler URL (pooler.supabase.com). ' +
    'Pooler hosts resolve to IPv6 which Railway cannot reach (ENETUNREACH). ' +
    'Use the Direct Connection URL instead: Supabase dashboard → ' +
    'Settings → Database → Connection string (port 5432, host db.[ref].supabase.co).'
  );
}

const storage = new PostgresStore({
  id: 'default',
  connectionString: supabaseDbUrl,
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
  workflows: {
    recorder: recorderWorkflow,
    pm: pmWorkflow,
    monitorResearch: monitorResearchWorkflow,
  },
  server: {
    apiRoutes: [
      { path: '/webhooks/telnyx', method: 'POST', handler: honoHandler(handleTelnyxWebhook) },
      { path: '/webhooks/zoom', method: 'POST', handler: honoHandler(handleZoomWebhook) },
      { path: '/webhooks/deepgram', method: 'POST', handler: honoHandler(handleDeepgramWebhook) },
    ],
  },
});

// Start Supabase Realtime listener for web directives
startWebDirectivesListener();

// Start Signal polling loop
startSignalListener();

// Start Supabase Realtime listener for Content Creator dispatches
startContentCreatorListener();

// Start Supabase Realtime listener for BA dispatches
startBAListener();

// Start Supabase Realtime listener for PM dispatches
startPMListener(mastra);

// Start hourly monitor check for research monitors
startMonitorListener(mastra);

// Start Supabase Realtime listener for Relationship Manager dispatches
startRelationshipManagerListener();

// Start Fastmail JMAP polling loop
startFastmailListener();
