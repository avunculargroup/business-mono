import { createClientFixtureContext } from '@platform/data-fixtures';
import type { ClientDataContext, ClientType } from '@platform/data';

/**
 * The test double for `getClientRepositories`, and it is not a hand-written
 * fake.
 *
 * It is `@platform/data-fixtures`, the same adapter that runs the client
 * contract suite in `src/client.conformance.test.ts` — so a page test here is
 * exercising something that passes all eight assertions production has to pass.
 * A bespoke mock would be free to answer in shapes no real adapter can produce,
 * which is how a page ends up depending on one.
 *
 * A devDependency, deliberately. `lib/boundary.test.ts` checks runtime
 * dependencies only, precisely so a fixture package can be used for tests
 * without ever reaching the bundle.
 */
export function fakeClientRepositories(
  clientType: ClientType = 'corporate',
  options: { disclosureCurrent?: boolean; anchor?: Date } = {},
): ClientDataContext {
  return createClientFixtureContext({
    clientType,
    disclosureCurrent: options.disclosureCurrent ?? true,
    ...(options.anchor ? { anchor: options.anchor } : {}),
  });
}

/**
 * A context whose reads answer empty, for the states that only appear when
 * there is nothing to show.
 *
 * Wraps rather than replaces, so every method a page might reach for still
 * exists and still behaves — overriding one read cannot accidentally remove
 * another.
 */
export function withEmptyReads(
  base: ClientDataContext,
  overrides: Partial<{
    [K in keyof ClientDataContext]: Partial<ClientDataContext[K]>;
  }>,
): ClientDataContext {
  const next = { ...base };
  for (const [domain, methods] of Object.entries(overrides)) {
    next[domain as keyof ClientDataContext] = {
      ...base[domain as keyof ClientDataContext],
      ...methods,
    } as never;
  }
  return next;
}
