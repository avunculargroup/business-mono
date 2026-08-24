/**
 * The fixture adapter: the demo's data source.
 *
 * It depends on `@platform/data` and `@platform/shared` and nothing else — no
 * database client, no network, no filesystem. That is enforced by its
 * `package.json` rather than by convention: a runtime fetch here would be a
 * dependency it does not have.
 */
export { createFixtureRepositories } from './bundle';
export { blocked } from './blocked';
export { addDays, at, onDate, type DayOffset } from './fixtures/anchor';
