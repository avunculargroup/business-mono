import { describe, expect, it } from 'vitest';
import type { Paginated, QueryOptions, ReadContext } from '../context';
import { DemoWriteBlockedError, NotFoundError } from '../errors';
import {
  expectDescendingBy,
  expectNotFound,
  expectPaginationContract,
  expectWriteBlocked,
} from './contract';

// The harness is the safety net for eleven verticals, so it gets tested against
// a deliberately broken adapter as well as a correct one. Phase 1 learned this
// the hard way: a guard that only ever sees the passing case can be vacuous and
// nobody finds out until it fails to catch something.

interface Row {
  id: string;
  createdAt: string;
}

const ROWS: Row[] = [
  { id: 'c', createdAt: '2026-03-01' },
  { id: 'b', createdAt: '2026-02-01' },
  { id: 'a', createdAt: '2026-01-01' },
];

function correctRead(_ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<Row>> {
  const offset = opts?.offset ?? 0;
  const items = ROWS.slice(offset, opts?.limit === undefined ? undefined : offset + opts.limit);
  return Promise.resolve({ items, total: ROWS.length, hasMore: offset + items.length < ROWS.length });
}

describe('expectPaginationContract', () => {
  it('passes a correct read', async () => {
    await expectPaginationContract(correctRead, { total: ROWS.length });
  });

  it('catches a read that ignores offset', async () => {
    const ignoresOffset = (_ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<Row>> =>
      Promise.resolve({
        items: ROWS.slice(0, opts?.limit),
        total: ROWS.length,
        hasMore: (opts?.limit ?? ROWS.length) < ROWS.length,
      });

    await expect(
      expectPaginationContract(ignoresOffset, { total: ROWS.length }),
    ).rejects.toThrow();
  });

  it('catches a read whose total disagrees with its own hasMore', async () => {
    const wrongHasMore = (ctx: ReadContext, opts?: QueryOptions): Promise<Paginated<Row>> =>
      correctRead(ctx, opts).then((page) => ({ ...page, hasMore: false }));

    await expect(expectPaginationContract(wrongHasMore, { total: ROWS.length })).rejects.toThrow();
  });

  it('refuses a dataset too small to test rather than passing vacuously', async () => {
    await expect(expectPaginationContract(correctRead, { total: 1 })).rejects.toThrow(
      /at least 2 rows/,
    );
  });
});

describe('expectDescendingBy', () => {
  it('passes a descending list and catches an ascending one', () => {
    expectDescendingBy(ROWS, 'createdAt');
    expect(() => expectDescendingBy([...ROWS].reverse(), 'createdAt')).toThrow();
  });
});

describe('expectNotFound', () => {
  it('checks the entity and id, not just the error type', async () => {
    await expectNotFound(() => Promise.reject(new NotFoundError('report', 'x')), {
      entity: 'report',
      id: 'x',
    });

    await expect(
      expectNotFound(() => Promise.reject(new NotFoundError('report', 'wrong-id')), {
        entity: 'report',
        id: 'x',
      }),
    ).rejects.toThrow();
  });

  it('catches a read that returns null instead of throwing', async () => {
    await expect(
      expectNotFound(() => Promise.resolve(null), { entity: 'report', id: 'x' }),
    ).rejects.toThrow();
  });
});

describe('expectWriteBlocked', () => {
  it('checks the table name, not just the error type', async () => {
    await expectWriteBlocked(
      () => Promise.reject(new DemoWriteBlockedError('approveActivity', 'agent_activity')),
      { operation: 'approveActivity', table: 'agent_activity' },
    );

    // Naming the real table is the feature, so a blocked write that names the
    // wrong one must fail the contract.
    await expect(
      expectWriteBlocked(
        () => Promise.reject(new DemoWriteBlockedError('approveActivity', 'wrong_table')),
        { operation: 'approveActivity', table: 'agent_activity' },
      ),
    ).rejects.toThrow();
  });

  it('catches a write that silently succeeds', async () => {
    await expect(
      expectWriteBlocked(() => Promise.resolve(), {
        operation: 'approveActivity',
        table: 'agent_activity',
      }),
    ).rejects.toThrow();
  });
});
