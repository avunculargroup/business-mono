// Shared base URL for Deepgram async callbacks. The agents server (Railway)
// serves /webhooks/deepgram; Deepgram POSTs results there. Both the recorder
// workflow and the podcast waterfall build their callback from this base so they
// stay in agreement. Localhost is used in dev (Deepgram won't reach it, but the
// submit still succeeds and tests don't depend on a real callback).
const DEEPGRAM_CALLBACK_BASE = process.env['RAILWAY_PUBLIC_DOMAIN']
  ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}`
  : 'http://localhost:3000';

export const DEEPGRAM_CALLBACK_URL = `${DEEPGRAM_CALLBACK_BASE}/webhooks/deepgram`;
