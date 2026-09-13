/**
 * Thrown by the fixture adapter for every write method.
 *
 * `table` is what lets the demo's toast name the table the write would have
 * touched. That specificity is a large part of what makes the demo read as a
 * real app rather than a mockup, so it is required rather than optional.
 */
export class DemoWriteBlockedError extends Error {
  constructor(
    readonly operation: string,
    readonly table: string,
  ) {
    super(`${operation} is disabled in demo mode`);
    this.name = 'DemoWriteBlockedError';
  }
}

export class NotFoundError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown by every client read when the Service Statement has not been
 * acknowledged.
 *
 * Lives here rather than in an adapter because it is a condition of the
 * contract, not an implementation detail: `apps/client` catches it, and two
 * adapters throwing two different classes for the same condition would make an
 * `instanceof` check correct against one of them and quietly wrong against the
 * other.
 *
 * Returning `null` or an empty list instead is not an option. The gate is the
 * point, and a repository that quietly answers a session failing it has moved
 * the gate into the middle tier, where a forgotten redirect lets it through.
 */
export class DisclosureRequiredError extends Error {
  constructor() {
    super('The current disclosure has not been acknowledged');
    this.name = 'DisclosureRequiredError';
  }
}
