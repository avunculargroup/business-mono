import { vi, type Mock } from 'vitest';

/**
 * Chainable Supabase query-builder fake for the web app's read paths.
 *
 * Web server components query like:
 *   from(table).select(cols, { count }).order(col, opts).limit(n)
 * and `await` the builder itself (PostgrestBuilder is thenable). So every
 * method returns the builder, and the builder resolves with the configured
 * `{ data, count, error }` response when awaited. Mirrors the agent server's
 * apps/agents/test/mocks/supabase.ts, plus `count` for the list pages.
 */
export type SupabaseResponse<T = unknown> = {
  data: T | null;
  count?: number | null;
  error: { message: string } | null;
};

export interface FakeQueryBuilder {
  table: string;
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  eq: Mock;
  order: Mock;
  limit: Mock;
  single: Mock;
  maybeSingle: Mock;
  then: (onFulfilled: (value: SupabaseResponse) => unknown) => Promise<unknown>;
  __response: SupabaseResponse;
}

export interface FakeSupabaseClient {
  from: Mock;
  rpc: Mock;
  __builders: FakeQueryBuilder[];
  /** Set the response returned for queries against a given table. */
  __setResponse: (table: string, response: SupabaseResponse) => void;
  /** Get all builders created for a given table. */
  __buildersFor: (table: string) => FakeQueryBuilder[];
}

function makeBuilder(table: string, response: SupabaseResponse): FakeQueryBuilder {
  const builder = { table, __response: response } as FakeQueryBuilder;

  const passthrough = (name: keyof FakeQueryBuilder) => {
    (builder as unknown as Record<string, unknown>)[name as string] = vi.fn(() => builder);
  };
  const terminal = (name: keyof FakeQueryBuilder) => {
    (builder as unknown as Record<string, unknown>)[name as string] = vi.fn(() =>
      Promise.resolve(builder.__response),
    );
  };

  (['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'] as const).forEach(passthrough);
  (['single', 'maybeSingle'] as const).forEach(terminal);

  // Thenable so `await query` (chain not ending in single/maybeSingle) resolves
  // with the configured response.
  builder.then = (onFulfilled) => Promise.resolve(builder.__response).then(onFulfilled);

  return builder;
}

export function createFakeSupabase(): FakeSupabaseClient {
  const builders: FakeQueryBuilder[] = [];
  const responses = new Map<string, SupabaseResponse>();

  return {
    from: vi.fn((table: string) => {
      const response = responses.get(table) ?? { data: null, count: null, error: null };
      const builder = makeBuilder(table, response);
      builders.push(builder);
      return builder;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    __builders: builders,
    __setResponse: (table, response) => responses.set(table, response),
    __buildersFor: (table) => builders.filter((b) => b.table === table),
  };
}
