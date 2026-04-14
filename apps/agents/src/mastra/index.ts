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

// MASTRA_DB_URL is the Postgres connection string used exclusively for Mastra's
// internal thread/memory storage (PostgresStore). It is NOT the Supabase JS client —
// that uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY over HTTPS and is unaffected.
//
// Recommended: point this at a Railway Postgres plugin (add one via Railway dashboard
// → + New → Database → PostgreSQL, then set MASTRA_DB_URL to ${{Postgres.DATABASE_URL}}).
// Railway-internal URLs are always IPv4 — no connectivity issues.
//
// Alternatively, use the Supabase direct connection (db.[ref].supabase.co:5432) but
// only if the Supabase IPv4 Add-On is enabled (Dashboard → Settings → Add-Ons → IPv4
// address, ~$4/mo). Without it, newer Supabase projects resolve to IPv6 only, which
// Railway cannot reach (ENETUNREACH).
const mastraDbUrl = process.env['MASTRA_DB_URL'] ?? process.env['SUPABASE_DB_URL'];
if (!mastraDbUrl) {
  throw new Error(
    'MASTRA_DB_URL is not set. Add a Postgres connection string for Mastra storage. ' +
    'Recommended: add a Railway Postgres plugin and set MASTRA_DB_URL=${{Postgres.DATABASE_URL}}. ' +
    'Alternatively, use the Supabase direct connection URL (db.[ref].supabase.co:5432) ' +
    'with the Supabase IPv4 Add-On enabled.'
  );
}

// Guard against literal IPv6 addresses — Railway containers cannot reach them.
const hasLiteralIPv6 = /\[[\da-fA-F:]+\]/.test(mastraDbUrl) ||
  /postgres(?:ql)?:\/\/[^@]+@[\da-fA-F]{0,4}(?::[\da-fA-F]{0,4}){2,}:/.test(mastraDbUrl);
if (hasLiteralIPv6) {
  throw new Error(
    'MASTRA_DB_URL contains a literal IPv6 address which Railway cannot reach (ENETUNREACH). ' +
    'Use a hostname-based URL. Recommended: Railway Postgres plugin (${{Postgres.DATABASE_URL}}). ' +
    'If using Supabase, use db.[ref].supabase.co:5432 (not the IPv6 address directly) ' +
    'with the Supabase IPv4 Add-On enabled.'
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
    // When connecting via IP, hostname-based cert verification is impossible
    // (the cert CN is the hostname, not the IP). Supabase also uses a custom
    // CA not in Node.js's trust store, causing SELF_SIGNED_CERT_IN_CHAIN.
    // Force no-verify: the connection remains encrypted; we skip chain checks.
    url.searchParams.set('sslmode', 'no-verify');
    return url.toString();
  } catch (err) {
    // No A (IPv4) records found for this hostname. Falling back to the
    // hostname would cause pg to resolve it to IPv6, which Railway cannot
    // reach (ENETUNREACH). Throw a clear error so the container fails fast
    // with an actionable message rather than crashing deep in storage init.
    throw new Error(
      `MASTRA_DB_URL hostname "${hostname}" has no IPv4 (A) DNS records. ` +
      'Railway containers cannot reach IPv6 addresses. ' +
      'Recommended fix: add a Railway Postgres plugin and set MASTRA_DB_URL=${{Postgres.DATABASE_URL}}. ' +
      'If using Supabase, enable the IPv4 Add-On (Dashboard → Settings → Add-Ons → IPv4 address, ~$4/mo). ' +
      `DNS error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

const resolvedDbUrl = await resolveDbUrlToIPv4(mastraDbUrl);

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
