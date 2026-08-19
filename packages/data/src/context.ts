/**
 * Read context and query shaping, shared by every repository method.
 */

/**
 * Passed to every read so fixture adapters can date relative to a fixed anchor
 * rather than storing literals — see `fixture-and-trace-schema.md`.
 *
 * It carries `asOf` and nothing else, deliberately. This type is threaded
 * through every read in the app, so a `principal`/`clientId` field here would
 * put the security boundary back into ~200 call sites while every repository
 * signature still looked compliant. Scoping is a constructor argument or it
 * does not exist. See `docs/features/demo-app/repository-contract.md` →
 * Design rules.
 */
export interface ReadContext {
  /** Defaults to `new Date()` in the Supabase adapter; the demo anchor in fixtures. */
  asOf: Date;
}

/**
 * The keys `ReadContext` is allowed to carry.
 *
 * This and the compile-time guard below are the two locks on the scoping rule.
 * Adding a field to `ReadContext` fails `tsc` on the guard; widening this array
 * to make the guard pass again fails `context.test.ts`. Neither can be picked
 * by accident, which is the point — the rule is cheap to hold now and expensive
 * to retrofit across ~20 repositories later.
 */
export const READ_CONTEXT_KEYS = ['asOf'] as const;

/** True only when `keyof T` and `K` are the same set of keys. */
type KeysAreExactly<T, K extends string> = [keyof T] extends [K]
  ? [K] extends [keyof T]
    ? true
    : false
  : false;

/**
 * Compile-time half of the scoping guard. Do not delete — it is the assertion,
 * not a derived value.
 */
export const READ_CONTEXT_KEYS_ARE_EXHAUSTIVE: KeysAreExactly<
  ReadContext,
  (typeof READ_CONTEXT_KEYS)[number]
> = true;

export interface QueryOptions {
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}
