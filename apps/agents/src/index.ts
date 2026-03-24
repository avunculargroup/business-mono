import { mastra } from './mastra/index.js';
import { handleTelnyxWebhook } from './webhooks/telnyx.js';
import { handleZoomWebhook } from './webhooks/zoom.js';
import { handleDeepgramWebhook } from './webhooks/deepgram.js';
import { handleSimonDirective } from './webhooks/simonDirective.js';

// Mastra serves its own HTTP server. We augment it with custom webhook routes.
// In Railway, PORT is set automatically.
const port = parseInt(process.env['PORT'] ?? '3000', 10);

// Register webhook handlers with Mastra's server
mastra.server?.addRoute('POST', '/webhooks/telnyx', handleTelnyxWebhook);
mastra.server?.addRoute('POST', '/webhooks/zoom', handleZoomWebhook);
mastra.server?.addRoute('POST', '/webhooks/deepgram', handleDeepgramWebhook);
mastra.server?.addRoute('POST', '/api/simon/directive', handleSimonDirective);

await mastra.start({ port });

console.log(`Agent server running on port ${port}`);
