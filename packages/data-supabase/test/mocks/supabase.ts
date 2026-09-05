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
   * Responses for successive reads of one table, in order.
   *
   * A single method can read the same table twice — resolving a report's
   * predecessor, for instance — and each read needs its own answer. The last
   * entry keeps answering once the queue runs dry, so a test only has to
   * describe the reads it cares about.
   */
  __queueResponses: (table: string, responses: SupabaseResponse[]) => void;
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
  /**
   * Back a table with rows that the builder actually queries.
   *
   * Where `__setRows` only slices, this one honours `eq`, `is`, a two-clause
   * `or`, `order` and `range`, so a repository's filtering and ordering are
   * exercised rather than assumed. It exists because the corporate holdings
   * domain has to pass the *same* conformance suite as the fixture adapter —
   * a suite that reads five companies by slug and expects five different
   * answers, which one canned response per table cannot give. A suite that can
   * only pass against fixtures is not a contract.
   *
   * Deliberately not a Postgres: no joins, no nested selects, no `not`. A
   * repository needing more than this should be tested against a real database
   * rather than a better fake.
   */
  __setDataset: (table: string, rows: Record<string, unknown>[]) => void;
  __buildersFor: (table: string) => FakeQueryBuilder[];
}

type Filter = (row: Record<string, unknown>) => boolean;

/** `column.is.null` or `column.eq.value` — the two forms the adapters use. */
function parseOrClause(clause: string): Filter {
  const [column, operator, value] = clause.split('.');
  if (operator === 'is' && value === 'null') return (row) => row[column] === null;
  if (operator === 'eq') return (row) => String(row[column]) === value;
  throw new Error(`fake supabase: unsupported or() clause "${clause}"`);
}

function makeDatasetBuilder(table: string, rows: Record<string, unknown>[]): FakeQueryBuilder {
  const builder = { table } as FakeQueryBuilder;
  const bag = builder as unknown as Record<string, unknown>;
  const filters: Filter[] = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let slice: { from: number; to: number } | null = null;

  const matched = (): Record<string, unknown>[] => {
    const kept = rows.filter((row) => filters.every((filter) => filter(row)));
    if (sort) {
      const { column, ascending } = sort;
      kept.sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    return kept;
  };

  const response = (): SupabaseResponse => {
    const kept = matched();
    const page = slice ? kept.slice(slice.from, slice.to + 1) : kept;
    return { data: page, count: kept.length, error: null };
  };

  PASSTHROUGH_METHODS.forEach((name) => {
    bag[name] = vi.fn(() => builder);
  });

  bag['eq'] = vi.fn((column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return builder;
  });
  bag['is'] = vi.fn((column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return builder;
  });
  bag['in'] = vi.fn((column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]));
    return builder;
  });
  bag['or'] = vi.fn((expression: string) => {
    const clauses = expression.split(',').map(parseOrClause);
    filters.push((row) => clauses.some((clause) => clause(row)));
    return builder;
  });
  bag['order'] = vi.fn((column: string, opts?: { ascending?: boolean }) => {
    sort = { column, ascending: opts?.ascending !== false };
    return builder;
  });
  bag['range'] = vi.fn((from: number, to: number) => {
    slice = { from, to };
    return builder;
  });
  bag['maybeSingle'] = vi.fn(() => {
    const kept = matched();
    return Promise.resolve({ data: kept[0] ?? null, count: kept.length, error: null });
  });
  bag['single'] = vi.fn(() => {
    const kept = matched();
    return Promise.resolve(
      kept.length === 1
        ? { data: kept[0], count: 1, error: null }
        : { data: null, count: kept.length, error: { message: 'no rows' } },
    );
  });

  Object.defineProperty(builder, '__response', { get: response });
  builder.then = (onFulfilled) => Promise.resolve(response()).then(onFulfilled);

  return builder;
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
  const queues = new Map<string, SupabaseResponse[]>();
  const rowsByTable = new Map<string, unknown[]>();
  const datasets = new Map<string, Record<string, unknown>[]>();

  return {
    from: vi.fn((table: string) => {
      const dataset = datasets.get(table);
      if (dataset) {
        const built = makeDatasetBuilder(table, dataset);
        builders.push(built);
        return built;
      }

      const queue = queues.get(table);
      const response = queue
        ? (queue.length > 1 ? queue.shift()! : queue[0]!)
        : responses.get(table) ?? { data: null, count: null, error: null };
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
    __queueResponses: (table, next) => queues.set(table, [...next]),
    __setRows: (table, rows) => rowsByTable.set(table, rows),
    __setDataset: (table, rows) => datasets.set(table, rows),
    __buildersFor: (table) => builders.filter((b) => b.table === table),
  };
}
