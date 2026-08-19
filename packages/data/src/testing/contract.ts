/**
 * The contract suite: written once, parameterised over an adapter.
 *
 * Both `@platform/data-supabase` and `@platform/data-fixtures` must pass it.
 * It is the primary safety net for the seam — Playwright is largely the wrong
 * tool there, because the risk is data wiring (a dropped filter, a wrong
 * `.order()`, a broken pagination boundary) and screenshots barely catch it.
 *
 * Parameterising matters more than it looks: with eleven verticals each adding
 * its domain's cases, a per-adapter harness would be written eleven times. Each
 * vertical adds cases here or calls these helpers from its own domain suite; no
 * vertical builds its own harness.
 */
import { describe, expect, it } from 'vitest';
import type { Paginated, QueryOptions, ReadContext } from '../context';
import type { RepositoryBundle, RepositoryMode } from '../bundle';
import { DemoWriteBlockedError, NotFoundError } from '../errors';

export interface AdapterUnderTest {
  /** Appears in the test name, e.g. 'supabase' or 'fixtures'. */
  name: string;
  expectedMode: RepositoryMode;
  createBundle(): RepositoryBundle | Promise<RepositoryBundle>;
}

/** A `ReadContext` for tests. Fixed by default so relative dating is reproducible. */
export function testReadContext(asOf = new Date('2026-01-01T00:00:00Z')): ReadContext {
  return { asOf };
}

/**
 * Cases every adapter must pass whatever domains it implements. Verticals add
 * their own `describe` blocks; this one stays domain-free.
 */
export function describeBundleContract(adapter: AdapterUnderTest): void {
  describe(`repository bundle contract: ${adapter.name}`, () => {
    it('reports the mode its adapter is built for', async () => {
      const bundle = await adapter.createBundle();
      expect(bundle.mode).toBe(adapter.expectedMode);
    });
  });
}

type ReadPage<T> = (ctx: ReadContext, opts?: QueryOptions) => Promise<Paginated<T>>;

/**
 * Asserts the pagination invariants against a real read.
 *
 * `total` is the count the adapter's dataset should report — the caller knows
 * it, the helper does not. Needs at least two rows to say anything useful, and
 * fails loudly rather than silently passing on a dataset too small to test.
 */
export async function expectPaginationContract<T extends { id: string }>(
  read: ReadPage<T>,
  expected: { total: number; ctx?: ReadContext },
): Promise<void> {
  const ctx = expected.ctx ?? testReadContext();
  const { total } = expected;

  if (total < 2) {
    throw new Error(
      `expectPaginationContract needs at least 2 rows to be meaningful, got ${total}`,
    );
  }

  const all = await read(ctx);
  expect(all.total).toBe(total);
  expect(all.hasMore).toBe(all.items.length < all.total);

  const first = await read(ctx, { limit: 1 });
  expect(first.items).toHaveLength(1);
  expect(first.total).toBe(total);
  expect(first.hasMore).toBe(true);

  const second = await read(ctx, { limit: 1, offset: 1 });
  expect(second.items).toHaveLength(1);
  expect(second.total).toBe(total);
  expect(second.items[0].id).not.toBe(first.items[0].id);

  const past = await read(ctx, { limit: 1, offset: total });
  expect(past.items).toHaveLength(0);
  expect(past.total).toBe(total);
  expect(past.hasMore).toBe(false);
}

/** Asserts a list is ordered by `key` descending — the default for every feed. */
export function expectDescendingBy<T>(items: readonly T[], key: keyof T): void {
  const values = items.map((item) => item[key]);
  const sorted = [...values].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  expect(values).toEqual(sorted);
}

/** Asserts a read for a missing id rejects with `NotFoundError`, not `null`. */
export async function expectNotFound(
  read: () => Promise<unknown>,
  expected: { entity: string; id: string },
): Promise<void> {
  await expect(read()).rejects.toThrow(NotFoundError);
  await read().catch((err: unknown) => {
    const notFound = err as NotFoundError;
    expect(notFound.entity).toBe(expected.entity);
    expect(notFound.id).toBe(expected.id);
  });
}

/**
 * Asserts a write rejects with `DemoWriteBlockedError` carrying the real table
 * name. The table is checked, not just the error type — naming the table is the
 * feature, so a blocked write that cannot say what it would have touched is a
 * failure.
 */
export async function expectWriteBlocked(
  write: () => Promise<unknown>,
  expected: { operation: string; table: string },
): Promise<void> {
  await expect(write()).rejects.toThrow(DemoWriteBlockedError);
  await write().catch((err: unknown) => {
    const blocked = err as DemoWriteBlockedError;
    expect(blocked.operation).toBe(expected.operation);
    expect(blocked.table).toBe(expected.table);
  });
}
