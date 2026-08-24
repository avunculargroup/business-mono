import { DemoWriteBlockedError } from '@platform/data';

/**
 * Every write in this adapter.
 *
 * The demo is read-only, but refusing a write is a feature rather than an
 * omission: the toast names the table the write *would* have touched, which is
 * a large part of what makes the demo read as a real app with its hands tied
 * rather than as a mockup with dead buttons. So the table is required, and it
 * is the real Postgres table name — not the read model's, not the domain's.
 *
 * Typed to return `never` so a repository method can `return blocked(...)` and
 * still satisfy a `Promise<Something>` signature without a cast.
 */
export function blocked(operation: string, table: string): never {
  throw new DemoWriteBlockedError(operation, table);
}
