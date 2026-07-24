import { vi, type Mock } from 'vitest';

/**
 * Chainable Supabase query-builder fake.
 *
 * Surface modeled on what the agent server actually calls:
 *   from(table).select(cols).eq(k, v).order(c, opts).limit(n).single()
 *   from(table).insert(rec).select().single()
 *   from(table).update(updates).eq(k, v).select().single()
 *   from(table).upsert(rec, opts)
 *
 * Each call is recorded on the builder for assertions; the terminal call
 * resolves with the configured `{ data, error }` response.
 */
export type SupabaseResponse<T = unknown> = { data: T | null; error: { message: string } | null };

export interface FakeQueryBuilder {
  table: string;
  select: Mock;
  insert: Mock;
  update: Mock;
  upsert: Mock;
  delete: Mock;
  eq: Mock;
  neq: Mock;
  not: Mock;
  is: Mock;
  in: Mock;
  lt: Mock;
  gt: Mock;
  lte: Mock;
  gte: Mock;
  order: Mock;
  limit: Mock;
  single: Mock;
  maybeSingle: Mock;
  then: (onFulfilled: (value: SupabaseResponse) => unknown) => Promise<unknown>;
  __response: SupabaseResponse;
  __terminalCalls: string[];
}

export interface FakeSupabaseClient {
  from: Mock;
  rpc: Mock;
  __builders: FakeQueryBuilder[];
  __responses: Map<string, SupabaseResponse>;
  /** Set the response returned for queries against a given table. */
  __setResponse: (table: string, response: SupabaseResponse) => void;
  /**
   * Queue responses for successive `from(table)` calls, dispensed in order.
   * Once the queue is exhausted, falls back to `__setResponse`/the default.
   * Use when one table is queried several times in a row with distinct results
   * (e.g. a SELECT followed by per-row claim UPDATEs).
   */
  __setResponses: (table: string, responses: SupabaseResponse[]) => void;
  /** Get all builders created for a given table. */
  __buildersFor: (table: string) => FakeQueryBuilder[];
}

function makeBuilder(table: string, response: SupabaseResponse): FakeQueryBuilder {
  const builder: Partial<FakeQueryBuilder> & {
    __response: SupabaseResponse;
    __terminalCalls: string[];
  } = {
    table,
    __response: response,
    __terminalCalls: [],
  };

  const passthrough = (name: string) => {
    const fn = vi.fn(() => builder as FakeQueryBuilder);
    (builder as Record<string, unknown>)[name] = fn;
    return fn;
  };
  const terminal = (name: string) => {
    const fn = vi.fn(() => {
      builder.__terminalCalls!.push(name);
      return Promise.resolve(builder.__response);
    });
    (builder as Record<string, unknown>)[name] = fn;
    return fn;
  };

  builder.select = passthrough('select');
  builder.insert = passthrough('insert');
  builder.update = passthrough('update');
  // Passthrough like the other verbs: `await ...upsert(x)` still resolves via the
  // thenable, and `.upsert(x).select().single()` chains work too.
  builder.upsert = passthrough('upsert');
  builder.delete = passthrough('delete');
  builder.eq = passthrough('eq');
  builder.neq = passthrough('neq');
  builder.not = passthrough('not');
  builder.is = passthrough('is');
  builder.in = passthrough('in');
  builder.lt = passthrough('lt');
  builder.gt = passthrough('gt');
  builder.lte = passthrough('lte');
  builder.gte = passthrough('gte');
  builder.order = passthrough('order');
  builder.limit = passthrough('limit');
  builder.single = terminal('single');
  builder.maybeSingle = terminal('maybeSingle');

  // Make the builder thenable so `await query` resolves with the response
  // (mirrors Supabase's PostgrestBuilder behaviour).
  builder.then = (onFulfilled: (value: SupabaseResponse) => unknown) =>
    Promise.resolve(builder.__response).then(onFulfilled);

  return builder as FakeQueryBuilder;
}

export function createFakeSupabase(): FakeSupabaseClient {
  const builders: FakeQueryBuilder[] = [];
  const responses = new Map<string, SupabaseResponse>();
  const responseQueues = new Map<string, SupabaseResponse[]>();

  const client: FakeSupabaseClient = {
    from: vi.fn((table: string) => {
      const queue = responseQueues.get(table);
      const response = (queue && queue.length > 0 ? queue.shift()! : responses.get(table))
        ?? { data: null, error: null };
      const builder = makeBuilder(table, response);
      builders.push(builder);
      return builder;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    __builders: builders,
    __responses: responses,
    __setResponse: (table, response) => {
      responses.set(table, response);
    },
    __setResponses: (table, queued) => {
      responseQueues.set(table, [...queued]);
    },
    __buildersFor: (table) => builders.filter((b) => b.table === table),
  };

  return client;
}
