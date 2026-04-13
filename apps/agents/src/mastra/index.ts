import { setDefaultResultOrder } from 'node:dns';
import { resolve4 } from 'node:dns/promises';
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

// Guard against literal IPv6 addresses in the connection string.
// Supabase dashboard sometimes shows an IPv6 direct-connection URL — these are
// unreachable on Railway. The URL-encoded form wraps the address in brackets:
// postgresql://user:pass@[2406:...]:5432/db
const hasLiteralIPv6 = /\[[\da-fA-F:]+\]/.test(supabaseDbUrl) ||
  // bare IPv6 in host position (no brackets, unlikely but guard anyway)
  /postgres(?:ql)?:\/\/[^@]+@[\da-fA-F]{0,4}(?::[\da-fA-F]{0,4}){2,}:/.test(supabaseDbUrl);
if (hasLiteralIPv6) {
  throw new Error(
    'SUPABASE_DB_URL contains a literal IPv6 address which Railway cannot reach (ENETUNREACH). ' +
    'Use the hostname-based Direct Connection URL instead: Supabase dashboard → ' +
    'Settings → Database → Connection string → Direct connection ' +
    '(host db.[ref].supabase.co, port 5432). Do NOT copy the IPv6 address directly.'
  );
}

// Newer Supabase projects return only AAAA records for db.[ref].supabase.co,
// making setDefaultResultOrder('ipv4first') ineffective (no A record to prefer).
// Resolve to IPv4 explicitly at startup and rewrite the URL so pg always
// connects via IPv4, which Railway can reach.
async function resolveDbUrlToIPv4(connStr: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(connStr);
  } catch {
    return connStr; // not a valid URL, let pg handle it
  }
  const hostname = url.hostname;
  // Already an IPv4 address — nothing to do.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return connStr;
  try {
    const [ipv4] = await resolve4(hostname);
    url.hostname = ipv4;
    // pg uses SNI for SSL — connecting via IP disables hostname verification.
    // Append sslmode=require so the connection is still encrypted.
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    return url.toString();
  } catch (err) {
    // No A (IPv4) records found for this hostname. Falling back to the
    // hostname would cause pg to resolve it to IPv6, which Railway cannot
    // reach (ENETUNREACH). Throw a clear error so the container fails fast
    // with an actionable message rather than crashing deep in storage init.
    throw new Error(
      `SUPABASE_DB_URL hostname "${hostname}" has no IPv4 (A) DNS records. ` +
      'Railway containers cannot reach IPv6 addresses. ' +
      'Options: (1) Enable the Supabase IPv4 Add-On (Dashboard → Settings → ' +
      'Add-Ons → IPv4 address, ~$4/mo) so db.[ref].supabase.co resolves to IPv4. ' +
      '(2) Check that SUPABASE_DB_URL is the Direct Connection URL ' +
      '(db.[ref].supabase.co:5432), not a pooler URL. ' +
      `DNS error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

const resolvedDbUrl = await resolveDbUrlToIPv4(supabaseDbUrl);

const storage = new PostgresStore({
  id: 'default',
  connectionString: resolvedDbUrl,
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
