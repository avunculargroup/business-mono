import { vi, type Mock } from 'vitest';

/**
 * Chainable Supabase query-builder fake for the adapter's tests.
 *
 * A copy of `apps/web/test/mocks/supabase.ts` rather than an import: a package
 * reaching into its consumer's test helpers is the coupling this seam exists to
 * remove, and the app-side copy is on its way out — every query it fakes moves
 * into this package as its vertical lands, and app tests move to repository
 * fakes. When the last one has, the app-side copy goes with it.
 *
 * Builders are thenable, because PostgrestBuilder is: a chain that does not end
 * in `single()`/`maybeSingle()` resolves when awaited.
 */
export type SupabaseResponse<T = unknown> = {
  data: T | null;
  count?: number | null;
  error: { message: string } | null;
};

const PASSTHROUGH_METHODS = [
  'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'overlaps', 'contains', 'filter', 'match', 'not',
  'order', 'limit', 'range',
] as const;

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
  __setResponse: (table: string, response: SupabaseResponse) => void;
  /**
   * Back a table with rows so `.range(from, to)` actually slices them and the
   * count reflects the whole set.
   *
   * Without this the fake returns one canned response whatever the range, and
   * the contract suite's pagination cases could not run against this adapter at
   * all — they would only ever prove that a stub returns its stub. The offset
   * arithmetic and the `hasMore` calculation are the adapter's own logic, and
   * an off-by-one there is precisely the class of bug the contract exists to
   * catch, so the fake has to be able to expose it.
   *
   * Rows are returned in the order given: ordering is the database's job, and
   * faking it here would test the fake.
   */
  __setRows: (table: string, rows: unknown[]) => void;
  __buildersFor: (table: string) => FakeQueryBuilder[];
}

function makeBuilder(
  table: string,
  response: SupabaseResponse,
  rows: unknown[] | undefined,
): FakeQueryBuilder {
  const builder = { table, __response: response } as FakeQueryBuilder;
  const bag = builder as unknown as Record<string, unknown>;

  PASSTHROUGH_METHODS.forEach((name) => {
    bag[name] = vi.fn(() => builder);
  });
  TERMINAL_METHODS.forEach((name) => {
    bag[name] = vi.fn(() => Promise.resolve(builder.__response));
  });

  if (rows) {
    builder.__response = { data: rows, count: rows.length, error: null };
    bag['range'] = vi.fn((from: number, to: number) => {
      builder.__response = { data: rows.slice(from, to + 1), count: rows.length, error: null };
      return builder;
    });
  }

  builder.then = (onFulfilled) => Promise.resolve(builder.__response).then(onFulfilled);

  return builder;
}

export function createFakeSupabase(): FakeSupabaseClient {
  const builders: FakeQueryBuilder[] = [];
  const responses = new Map<string, SupabaseResponse>();
  const rowsByTable = new Map<string, unknown[]>();

  return {
    from: vi.fn((table: string) => {
      const response = responses.get(table) ?? { data: null, count: null, error: null };
      const builder = makeBuilder(table, response, rowsByTable.get(table));
      builders.push(builder);
      return builder;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null })),
    },
    __builders: builders,
    __setResponse: (table, response) => responses.set(table, response),
    __setRows: (table, rows) => rowsByTable.set(table, rows),
    __buildersFor: (table) => builders.filter((b) => b.table === table),
  };
}
