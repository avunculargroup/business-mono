/**
 * Typed boundary for the tables this feature adds.
 *
 * `report_candidates`, `reports` and `report_segments` — and the new
 * `report_watch` columns on `news_sources` — are absent from
 * `packages/db/src/types/database.ts` until
 * `pnpm --filter @platform/db generate-types` runs against the migrated
 * database. The house pattern for that gap is a boundary cast with the row
 * shape asserted explicitly (see `lib/contentEmbeddings.ts` and
 * `lib/transcripts/embedSegments.ts`).
 *
 * Doing it once here rather than per call site keeps the explanation in one
 * place, keeps the chained query surface structurally checked, and gives the
 * post-regeneration cleanup a single file to delete: swap `reportDb` back to
 * `supabase` and the casts disappear.
 */

import { supabase } from '@platform/db';

export type ReportWatchTable =
  | 'report_candidates'
  | 'reports'
  | 'report_segments'
  | 'news_sources'
  | 'news_items';

export type DbResponse<T> = { data: T; error: { message: string; code?: string } | null };

/** The chained filter/terminal surface these modules actually use. */
export interface ReportQuery<T> extends PromiseLike<DbResponse<T[]>> {
  select(columns?: string): ReportQuery<T>;
  eq(column: string, value: unknown): ReportQuery<T>;
  is(column: string, value: unknown): ReportQuery<T>;
  in(column: string, values: readonly unknown[]): ReportQuery<T>;
  order(column: string, options?: { ascending?: boolean }): ReportQuery<T>;
  limit(count: number): ReportQuery<T>;
  single(): Promise<DbResponse<T | null>>;
  maybeSingle(): Promise<DbResponse<T | null>>;
}

export interface ReportTableClient {
  select<T = Record<string, unknown>>(columns?: string): ReportQuery<T>;
  insert<T = Record<string, unknown>>(rows: unknown): ReportQuery<T>;
  update<T = Record<string, unknown>>(row: Record<string, unknown>): ReportQuery<T>;
  upsert<T = Record<string, unknown>>(
    rows: unknown,
    options?: { onConflict?: string },
  ): ReportQuery<T>;
  delete<T = Record<string, unknown>>(): ReportQuery<T>;
}

export interface ReportWatchDb {
  from(table: ReportWatchTable): ReportTableClient;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options?: { contentType?: string; upsert?: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Resolved per call, not snapshotted at module load. `@platform/db` exposes
 * `supabase` as a live binding that tests replace behind a getter, so capturing
 * it once here would hand every call site whatever existed at import time.
 */
const client = (): ReportWatchDb => supabase as unknown as ReportWatchDb;

export const reportDb: ReportWatchDb = {
  from: (table) => client().from(table),
  get storage() {
    return client().storage;
  },
};
