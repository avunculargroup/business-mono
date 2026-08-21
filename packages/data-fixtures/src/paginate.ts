import type { Paginated, QueryOptions } from '@platform/data';

/**
 * The one place this adapter slices a list.
 *
 * The live adapter gets `total` from Postgres and `items` from a `.range()`;
 * here both come from the same array, and the invariant that binds them —
 * `hasMore` is about the whole set, not the page — is easy to get subtly wrong
 * per domain. Doing it once means the contract suite's pagination cases are
 * testing one implementation rather than seven.
 */
export function paginate<T>(rows: readonly T[], opts?: QueryOptions): Paginated<T> {
  const offset = opts?.offset ?? 0;
  const items = opts?.limit === undefined
    ? rows.slice(offset)
    : rows.slice(offset, offset + opts.limit);

  return {
    items: [...items],
    total: rows.length,
    hasMore: offset + items.length < rows.length,
  };
}
