import { Mastra } from '@mastra/core';
import type { Context } from 'hono';
import { simon } from '../agents/simon/index.js';
import { archivist } from '../agents/archivist/index.js';
import { ba } from '../agents/ba/index.js';
import { contentCreator } from '../agents/contentCreator/index.js';
import { recorderWorkflow } from '../agents/recorder/workflow.js';
import { pmWorkflow } from '../agents/pm/workflow.js';
import { handleTelnyxWebhook } from '../webhooks/telnyx.js';
import { handleZoomWebhook } from '../webhooks/zoom.js';
import { handleDeepgramWebhook } from '../webhooks/deepgram.js';
import { startWebDirectivesListener } from '../listeners/webDirectives.js';
import { startSignalListener } from '../listeners/signalListener.js';

// Adapt Web API handlers (Request → Response) to Hono handlers
const honoHandler = (fn: (req: Request) => Promise<Response>) =>
  (c: Context) => fn(c.req.raw);

export const mastra = new Mastra({
  agents: {
    simon,
    archivist,
    ba,
    contentCreator,
  },
  workflows: {
    recorder: recorderWorkflow,
    pm: pmWorkflow,
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
