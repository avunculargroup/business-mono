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
