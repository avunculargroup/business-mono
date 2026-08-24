import { describe, expect, it } from 'vitest';
import { DemoWriteBlockedError, NotFoundError } from './errors';

describe('DemoWriteBlockedError', () => {
  it('carries the operation and the real table name', () => {
    const err = new DemoWriteBlockedError('approveActivity', 'agent_activity');

    expect(err.operation).toBe('approveActivity');
    expect(err.table).toBe('agent_activity');
    expect(err.message).toBe('approveActivity is disabled in demo mode');
  });

  it('is catchable by type', () => {
    // The demo toast branches on this, so `instanceof` has to survive the
    // Error subclass dance rather than only `name` matching.
    const err: unknown = new DemoWriteBlockedError('createItem', 'content_items');

    expect(err).toBeInstanceOf(DemoWriteBlockedError);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('DemoWriteBlockedError');
  });
});

describe('NotFoundError', () => {
  it('carries the entity and id', () => {
    const err = new NotFoundError('market report', 'abc-123');

    expect(err.entity).toBe('market report');
    expect(err.id).toBe('abc-123');
    expect(err.message).toBe('market report abc-123 not found');
    expect(err).toBeInstanceOf(NotFoundError);
  });
});
