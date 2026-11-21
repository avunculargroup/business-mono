/**
 * The one title cleaner lives in @platform/shared (newsTitle.ts), shared with
 * the agents' ingest paths and the digest email so every surface reads the same.
 */
export { cleanNewsTitle } from '@platform/shared';
