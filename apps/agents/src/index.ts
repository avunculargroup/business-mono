// Entry point for local dev only.
// Railway runs the Mastra bundle directly: node .mastra/output/index.mjs
// Webhooks and the Realtime listener are registered in src/mastra/index.ts
// so they are included in the bundle.

import './mastra/index.js';
