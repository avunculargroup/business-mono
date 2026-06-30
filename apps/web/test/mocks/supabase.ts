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

/** Chainable (passthrough) builder methods — return the builder for further chaining. */
const PASSTHROUGH_METHODS = [
  'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'overlaps', 'contains', 'filter', 'match', 'not',
  'order', 'limit', 'range',
] as const;

/** Terminal builder methods — resolve with the configured response. */
const TERMINAL_METHODS = ['single', 'maybeSingle'] as const;

type PassthroughMethod = (typeof PASSTHROUGH_METHODS)[number];
type TerminalMethod = (typeof TERMINAL_METHODS)[number];

export type FakeQueryBuilder = {
  table: string;
  then: (onFulfilled: (value: SupabaseResponse) => unknown) => Promise<unknown>;
  __response: SupabaseResponse;
} & Record<PassthroughMethod | TerminalMethod, Mock>;

export interface FakeSupabaseClient {
  from: Mock;
  rpc: Mock;
  auth: { getUser: Mock };
  __builders: FakeQueryBuilder[];
  /** Set the response returned for queries against a given table. */
  __setResponse: (table: string, response: SupabaseResponse) => void;
  /** Get all builders created for a given table. */
  __buildersFor: (table: string) => FakeQueryBuilder[];
  /** Set the user returned by auth.getUser (pass null to simulate signed-out). */
  __setUser: (user: { id: string } | null) => void;
}

function makeBuilder(table: string, response: SupabaseResponse): FakeQueryBuilder {
  const builder = { table, __response: response } as FakeQueryBuilder;
  const bag = builder as unknown as Record<string, unknown>;

  PASSTHROUGH_METHODS.forEach((name) => {
    bag[name] = vi.fn(() => builder);
  });
  TERMINAL_METHODS.forEach((name) => {
    bag[name] = vi.fn(() => Promise.resolve(builder.__response));
  });

  // Thenable so `await query` (chain not ending in single/maybeSingle) resolves
  // with the configured response.
  builder.then = (onFulfilled) => Promise.resolve(builder.__response).then(onFulfilled);

  return builder;
}

export function createFakeSupabase(): FakeSupabaseClient {
  const builders: FakeQueryBuilder[] = [];
  const responses = new Map<string, SupabaseResponse>();
  let user: { id: string } | null = { id: 'test-user' };

  return {
    from: vi.fn((table: string) => {
      const response = responses.get(table) ?? { data: null, count: null, error: null };
      const builder = makeBuilder(table, response);
      builders.push(builder);
      return builder;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
    },
    __builders: builders,
    __setResponse: (table, response) => responses.set(table, response),
    __buildersFor: (table) => builders.filter((b) => b.table === table),
    __setUser: (next) => {
      user = next;
    },
  };
}
