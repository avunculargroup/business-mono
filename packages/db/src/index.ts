export { supabase, createRealtimeClient } from './client.js';
export type { Database, Json } from './types/database.js';
export { vectorSearch } from './rpc/vectorSearch.js';
export { graphTraverse } from './rpc/graphTraverse.js';
export { fulltextSearch } from './rpc/fulltextSearch.js';
export type { VectorSearchResult } from './rpc/vectorSearch.js';
export type { GraphTraverseResult } from './rpc/graphTraverse.js';
export type { FulltextSearchResult } from './rpc/fulltextSearch.js';

// Web app client factories (cookie-based auth via @supabase/ssr)
export { createServerSupabaseClient } from './server.js';
export { createBrowserSupabaseClient } from './browser.js';
